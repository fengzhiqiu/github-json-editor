import React, { useState, useRef, useMemo } from 'react';
import {
  Button,
  Space,
  Divider,
  Tag,
  Collapse,
  Typography,
  message,
} from 'antd';
import {
  SoundOutlined,
  PauseCircleOutlined,
} from '@ant-design/icons';

const { Text } = Typography;
const { Panel } = Collapse;

const CDN_BASE = 'https://cdn.jsdmirror.com/gh/techinsblog/cdn/en';

/**
 * Deconflict word-bubble positions to avoid overlapping.
 * Works in percentage coordinate space (0-100 for both axes).
 * Each label is approximated as a rectangle of `labelW x labelH` percent units.
 */
function deconflictPositions(
  words: Array<{ id: string; position: { x: number; y: number } }>,
  labelW = 18,   // estimated label width in % of container
  labelH = 8,    // estimated label height in % of container
  maxIter = 60
): Map<string, { x: number; y: number }> {
  const pos = new Map(words.map((w) => [w.id, { x: w.position.x, y: w.position.y }]));

  for (let iter = 0; iter < maxIter; iter++) {
    let anyOverlap = false;

    for (let i = 0; i < words.length; i++) {
      for (let j = i + 1; j < words.length; j++) {
        const a = pos.get(words[i].id)!;
        const b = pos.get(words[j].id)!;

        const overlapX = Math.abs(a.x - b.x) < labelW;
        const overlapY = Math.abs(a.y - b.y) < labelH;

        if (overlapX && overlapY) {
          anyOverlap = true;
          // Push apart along the axis with less overlap
          const dx = a.x - b.x;
          const dy = a.y - b.y;

          // Prefer vertical separation (labels tend to be wider than tall)
          const pushY = (labelH - Math.abs(dy)) / 2 + 1;
          const pushX = (labelW - Math.abs(dx)) / 2 + 1;

          if (Math.abs(dy) * (labelW / labelH) <= Math.abs(dx)) {
            // separate vertically
            const signY = dy >= 0 ? 1 : -1;
            pos.set(words[i].id, { ...a, y: clamp(a.y + signY * pushY, 5, 95) });
            pos.set(words[j].id, { ...b, y: clamp(b.y - signY * pushY, 5, 95) });
          } else {
            // separate horizontally
            const signX = dx >= 0 ? 1 : -1;
            pos.set(words[i].id, { ...a, x: clamp(a.x + signX * pushX, 5, 95) });
            pos.set(words[j].id, { ...b, x: clamp(b.x - signX * pushX, 5, 95) });
          }
        }
      }
    }

    if (!anyOverlap) break;
  }

  return pos;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

export interface SceneData {
  id: number;
  title: string;
  categoryId?: string;
  category?: string; // deprecated, kept for backward compat
  gradient?: string;
  image?: string;
  audioUrl?: string;
  sentence: {
    en: string;
    zh: string;
    highlights: string[];
  };
  words: Array<{
    id: string;
    text: string;
    zhText: string;
    phonetic: string;
    pos: string;
    meaning: string;
    example: { en: string; zh: string };
    synonyms: string[];
    position: { x: number; y: number };
  }>;
  collocations?: Array<{ phrase: string; meaning: string }>;
}

interface ScenePreviewProps {
  sceneData: SceneData;
  imageUrl?: string;
  audioUrl?: string;
}

const ScenePreview: React.FC<ScenePreviewProps> = ({ sceneData, imageUrl, audioUrl }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Pre-compute deconflicted label positions
  const labelPositions = useMemo(
    () => deconflictPositions(sceneData.words),
    [sceneData.id]
  );

  // Derive URLs from scene data if not provided
  const resolvedImageUrl = imageUrl
    || sceneData.image
    || `${CDN_BASE}/img/scene-${sceneData.id}.webp`;
  const resolvedAudioUrl = audioUrl
    || sceneData.audioUrl
    || `${CDN_BASE}/audio/scene-${sceneData.id}.mp3`;

  const toggleAudio = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play();
      setIsPlaying(true);
    }
  };

  return (
    <div>
      {/* Phone-style preview container */}
      <div
        style={{
          width: '100%',
          maxWidth: 375,
          margin: '0 auto',
          borderRadius: 24,
          overflow: 'hidden',
          boxShadow: '0 8px 40px rgba(0,0,0,0.15)',
          background: '#000',
          position: 'relative',
          aspectRatio: '375 / 812',
        }}
      >
        {/* Blurred background layer */}
        <div
          style={{
            position: 'absolute',
            inset: '-10%',
            backgroundImage: `url(${resolvedImageUrl})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            filter: 'blur(30px) brightness(0.6)',
            transform: 'scale(1.2)',
          }}
        />

        {/* Main image (aspect-fit) */}
        <img
          src={resolvedImageUrl}
          alt={sceneData.title}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            zIndex: 1,
          }}
          onLoad={(e) => {
            const img = e.currentTarget;
            const containerW = img.clientWidth;
            const containerH = img.clientHeight;
            const imgRatio = img.naturalWidth / img.naturalHeight;
            const containerRatio = containerW / containerH;

            let area: { top: number; left: number; width: number; height: number };
            if (imgRatio > containerRatio) {
              const displayH = containerW / imgRatio;
              area = {
                top: ((containerH - displayH) / 2 / containerH) * 100,
                left: 0,
                width: 100,
                height: (displayH / containerH) * 100,
              };
            } else {
              const displayW = containerH * imgRatio;
              area = {
                top: 0,
                left: ((containerW - displayW) / 2 / containerW) * 100,
                width: (displayW / containerW) * 100,
                height: 100,
              };
            }

            const tagContainer = img.parentElement?.querySelector('.tag-layer') as HTMLElement;
            if (tagContainer) {
              tagContainer.style.top = `${area.top}%`;
              tagContainer.style.left = `${area.left}%`;
              tagContainer.style.width = `${area.width}%`;
              tagContainer.style.height = `${area.height}%`;
            }
          }}
        />

        {/* Gradient overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'linear-gradient(180deg, rgba(0,0,0,0.25) 0%, rgba(0,0,0,0) 20%, rgba(0,0,0,0) 55%, rgba(0,0,0,0.5) 100%)',
            zIndex: 2,
          }}
        />

        {/* Word tags positioned on image */}
        <div
          className="tag-layer"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            zIndex: 3,
          }}
        >
          {sceneData.words.map((word) => {
            const pos = labelPositions.get(word.id) || word.position;
            return (
              <div
                key={word.id}
                style={{
                  position: 'absolute',
                  left: `${pos.x}%`,
                  top: `${pos.y}%`,
                  transform: 'translate(-50%, -50%)',
                  background: 'rgba(255,255,255,0.92)',
                  backdropFilter: 'blur(16px)',
                  borderRadius: 17,
                  padding: '6px 14px',
                  boxShadow: '0 2px 10px rgba(0,0,0,0.15)',
                  fontSize: 13,
                  fontWeight: 700,
                  color: '#3a3a3a',
                  whiteSpace: 'nowrap',
                  fontFamily: 'Georgia, serif',
                  fontStyle: 'italic',
                }}
              >
                {word.text}
              </div>
            );
          })}
        </div>

        {/* Bottom sentence area */}
        <div
          style={{
            position: 'absolute',
            bottom: 0,
            left: 0,
            right: 0,
            padding: '40px 20px 30px',
            zIndex: 4,
          }}
        >
          <div style={{ color: '#fff', fontSize: 16, lineHeight: 1.6 }}>
            {sceneData.sentence.en.split(' ').map((word, idx) => {
              const cleaned = word.replace(/[.,!?;:'"()]/g, '').toLowerCase();
              const isHighlight = sceneData.sentence.highlights.includes(cleaned);
              return (
                <span
                  key={idx}
                  style={{
                    color: isHighlight ? '#FFD700' : '#fff',
                    fontWeight: isHighlight ? 700 : 400,
                  }}
                >
                  {word}{' '}
                </span>
              );
            })}
          </div>
          <div style={{ color: 'rgba(255,255,255,0.7)', fontSize: 13, marginTop: 6 }}>
            {sceneData.sentence.zh}
          </div>
        </div>
      </div>

      {/* Audio player */}
      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <Button
          shape="round"
          icon={isPlaying ? <PauseCircleOutlined /> : <SoundOutlined />}
          onClick={toggleAudio}
          size="large"
        >
          {isPlaying ? '暂停' : '播放场景音频'}
        </Button>
        <audio
          ref={audioRef}
          src={resolvedAudioUrl}
          onEnded={() => setIsPlaying(false)}
          onError={() => message.warning('音频加载失败')}
        />
      </div>

      {/* Scene metadata */}
      <div style={{ marginTop: 20 }}>
        <Space wrap>
          <Tag color="blue">ID: {sceneData.id}</Tag>
          {(sceneData.categoryId || sceneData.category) && <Tag color="green">{sceneData.categoryId || sceneData.category}</Tag>}
          <Tag>{sceneData.words.length} 个单词</Tag>
          {sceneData.collocations && sceneData.collocations.length > 0 && (
            <Tag>{sceneData.collocations.length} 个搭配</Tag>
          )}
        </Space>
      </div>

      {/* Word details */}
      <Divider />
      <Collapse ghost>
        <Panel header={`📚 单词列表 (${sceneData.words.length})`} key="words">
          {sceneData.words.map((word) => (
            <div
              key={word.id}
              style={{
                padding: '8px 0',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              <Space>
                <Text strong>{word.text}</Text>
                <Text type="secondary">{word.phonetic}</Text>
                <Tag>{word.pos}</Tag>
              </Space>
              <div style={{ marginTop: 4 }}>
                <Text>{word.meaning}</Text>
                <Text type="secondary" style={{ marginLeft: 12 }}>
                  坐标: ({word.position.x}, {word.position.y})
                </Text>
              </div>
              <div style={{ marginTop: 2 }}>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  例: {word.example.en}
                </Text>
              </div>
            </div>
          ))}
        </Panel>

        {sceneData.collocations && sceneData.collocations.length > 0 && (
          <Panel header="📖 搭配短语" key="collocations">
            {sceneData.collocations.map((c, i) => (
              <div key={i} style={{ padding: '4px 0' }}>
                <Text strong>{c.phrase}</Text>
                <Text type="secondary" style={{ marginLeft: 8 }}>{c.meaning}</Text>
              </div>
            ))}
          </Panel>
        )}

        <Panel header="🔧 原始 JSON" key="json">
          <pre
            style={{
              background: '#f5f5f5',
              padding: 12,
              borderRadius: 8,
              fontSize: 11,
              maxHeight: 400,
              overflow: 'auto',
            }}
          >
            {JSON.stringify(sceneData, null, 2)}
          </pre>
        </Panel>
      </Collapse>
    </div>
  );
};

export default ScenePreview;
