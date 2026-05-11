import React, { useState, useRef } from 'react';
import {
  Card,
  Upload,
  Select,
  Input,
  Button,
  message,
  Typography,
  Space,
  Divider,
  Collapse,
  Tag,
  Spin,
} from 'antd';
import {
  ArrowLeftOutlined,
  UploadOutlined,
  RocketOutlined,
  SoundOutlined,
  PauseCircleOutlined,
  CheckCircleOutlined,
  EditOutlined,
} from '@ant-design/icons';

const { Text, Title } = Typography;
const { Panel } = Collapse;

// Dify Cloud API
const DIFY_BASE_URL = 'https://api.dify.ai/v1';
const DIFY_API_KEY_STORAGE = 'dify-scene-generator-api-key';

// CDN base (jsDelivr mirror)
const CDN_BASE = 'https://cdn.jsdmirror.com/gh/techinsblog/cdn/en';

const CATEGORIES = ['日常', '治愈', '旅行', '日常出行', '美食', '运动'];

interface DifyGeneratorProps {
  onBack: () => void;
  onEditScene?: (sceneData: any) => void;
}

interface SceneData {
  id: number;
  title: string;
  category: string;
  gradient: string;
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
  collocations: Array<{ phrase: string; meaning: string }>;
}

const DifyGenerator: React.FC<DifyGeneratorProps> = ({ onBack, onEditScene }) => {
  const [apiKey, setApiKey] = useState<string>(
    () => localStorage.getItem(DIFY_API_KEY_STORAGE) || ''
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [category, setCategory] = useState<string>('');
  const [title, setTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [sceneImageUrl, setSceneImageUrl] = useState('');
  const [sceneAudioUrl, setSceneAudioUrl] = useState('');
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem(DIFY_API_KEY_STORAGE, key);
  };

  const handleImageSelect = (file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    return false; // prevent auto upload
  };

  const runWorkflow = async () => {
    if (!apiKey.trim()) {
      message.error('请先配置 Dify API Key');
      return;
    }
    if (!imageFile) {
      message.error('请上传场景图片');
      return;
    }
    if (!category) {
      message.error('请选择分类');
      return;
    }

    setGenerating(true);
    setProgress('正在上传图片...');
    setSceneData(null);

    try {
      // Step 1: Upload file to Dify
      const uploadForm = new FormData();
      uploadForm.append('file', imageFile);
      uploadForm.append('user', 'json-editor');

      const uploadRes = await fetch(`${DIFY_BASE_URL}/files/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: uploadForm,
      });

      if (!uploadRes.ok) {
        throw new Error(`文件上传失败: ${uploadRes.status} ${await uploadRes.text()}`);
      }

      const uploadData = await uploadRes.json();
      const fileId = uploadData.id;

      setProgress('正在调用 AI 工作流生成场景数据...');

      // Step 2: Run workflow
      // The start node has a file-type variable "image" — pass the uploaded file ref via inputs
      const inputs: Record<string, any> = {
        image: {
          type: 'image',
          transfer_method: 'local_file',
          upload_file_id: fileId,
        },
      };
      if (category) inputs.category = category;
      if (title.trim()) inputs.title = title.trim();

      const runRes = await fetch(`${DIFY_BASE_URL}/workflows/run`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          inputs,
          response_mode: 'blocking',
          user: 'json-editor',
        }),
      });

      if (!runRes.ok) {
        throw new Error(`工作流执行失败: ${runRes.status} ${await runRes.text()}`);
      }

      const runData = await runRes.json();

      if (runData.data?.status === 'failed') {
        throw new Error(`工作流失败: ${runData.data?.error || '未知错误'}`);
      }

      const outputs = runData.data?.outputs;
      if (!outputs) {
        throw new Error('工作流未返回输出');
      }

      setProgress('生成成功，正在加载预览...');

      // Extract scene ID from outputs
      const sceneId = parseInt(outputs.scene_id);
      if (!sceneId) {
        throw new Error('无法获取场景 ID');
      }

      // Fetch scene JSON from CDN (with cache buster)
      const jsonUrl = `${CDN_BASE}/data/scenes/${sceneId}.json?_t=${Date.now()}`;
      
      // CDN might need a few seconds to propagate; retry
      let sceneJson: SceneData | null = null;
      for (let attempt = 0; attempt < 5; attempt++) {
        await new Promise((r) => setTimeout(r, attempt === 0 ? 3000 : 5000));
        try {
          const jsonRes = await fetch(jsonUrl);
          if (jsonRes.ok) {
            sceneJson = await jsonRes.json();
            break;
          }
        } catch {
          // retry
        }
        setProgress(`CDN 同步中，等待第 ${attempt + 2} 次尝试...`);
      }

      if (!sceneJson) {
        // Fallback: try GitHub raw directly
        const rawUrl = `https://raw.githubusercontent.com/techinsblog/cdn/main/en/data/scenes/${sceneId}.json`;
        const rawRes = await fetch(rawUrl);
        if (rawRes.ok) {
          sceneJson = await rawRes.json();
        }
      }

      if (!sceneJson) {
        throw new Error('无法加载生成的场景 JSON（CDN 尚未同步）');
      }

      setSceneData(sceneJson);
      setSceneImageUrl(`${CDN_BASE}/img/scene-${sceneId}.webp?_t=${Date.now()}`);
      setSceneAudioUrl(`${CDN_BASE}/audio/scene-${sceneId}.mp3?_t=${Date.now()}`);
      setProgress('');

      message.success(`🎉 场景 ${sceneId}「${sceneJson.title}」生成成功！`);
    } catch (e: any) {
      message.error(e.message || '生成失败');
      setProgress('');
    } finally {
      setGenerating(false);
    }
  };

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

  const handleEditScene = () => {
    if (sceneData && onEditScene) {
      onEditScene(sceneData);
    }
  };

  return (
    <div>
      <Button
        icon={<ArrowLeftOutlined />}
        onClick={onBack}
        style={{ marginBottom: 16 }}
      >
        返回
      </Button>

      <Card title="🚀 AI 场景生成器" style={{ marginBottom: 24 }}>
        <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
          上传一张场景图片，AI 自动识别并生成词汇数据、音频，直接提交到 GitHub。
        </Text>

        {/* API Key Config */}
        <div style={{ marginBottom: 16 }}>
          <Text strong style={{ display: 'block', marginBottom: 4 }}>Dify API Key</Text>
          <Input.Password
            value={apiKey}
            onChange={(e) => saveApiKey(e.target.value)}
            placeholder="app-xxxx (Dify 工作流 API Key)"
            style={{ maxWidth: 400 }}
          />
        </div>

        <Divider />

        {/* Form */}
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>场景图片 *</Text>
            <Upload
              accept="image/*"
              maxCount={1}
              beforeUpload={handleImageSelect}
              showUploadList={false}
            >
              <Button icon={<UploadOutlined />}>选择图片</Button>
            </Upload>
            {imagePreview && (
              <img
                src={imagePreview}
                alt="preview"
                style={{
                  marginTop: 12,
                  maxWidth: 300,
                  maxHeight: 200,
                  borderRadius: 8,
                  objectFit: 'cover',
                }}
              />
            )}
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>分类 *</Text>
            <Select
              value={category || undefined}
              onChange={setCategory}
              placeholder="选择场景分类"
              style={{ width: 200 }}
              options={CATEGORIES.map((c) => ({ label: c, value: c }))}
            />
          </div>

          <div>
            <Text strong style={{ display: 'block', marginBottom: 8 }}>标题（选填，AI 自动生成）</Text>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="留空则由 AI 自动起标题"
              style={{ maxWidth: 300 }}
            />
          </div>

          <Button
            type="primary"
            size="large"
            icon={<RocketOutlined />}
            onClick={runWorkflow}
            loading={generating}
            disabled={!imageFile || !category || !apiKey}
          >
            生成场景
          </Button>

          {progress && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Spin size="small" />
              <Text type="secondary">{progress}</Text>
            </div>
          )}
        </Space>
      </Card>

      {/* Preview Section */}
      {sceneData && (
        <Card
          title={
            <Space>
              <CheckCircleOutlined style={{ color: '#52c41a' }} />
              <span>场景预览 — {sceneData.title}</span>
            </Space>
          }
          extra={
            onEditScene ? (
              <Button icon={<EditOutlined />} onClick={handleEditScene}>
                编辑调整
              </Button>
            ) : null
          }
        >
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
                backgroundImage: `url(${sceneImageUrl})`,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
                filter: 'blur(30px) brightness(0.6)',
                transform: 'scale(1.2)',
              }}
            />

            {/* Main image (aspect-fit) */}
            <img
              src={sceneImageUrl}
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
                // Calculate actual display area for tag positioning
                const img = e.currentTarget;
                const containerW = img.clientWidth;
                const containerH = img.clientHeight;
                const imgRatio = img.naturalWidth / img.naturalHeight;
                const containerRatio = containerW / containerH;

                let area: any;
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

                // Update tag container position
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
              {sceneData.words.map((word) => (
                <div
                  key={word.id}
                  style={{
                    position: 'absolute',
                    left: `${word.position.x}%`,
                    top: `${word.position.y}%`,
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
              ))}
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
          {sceneAudioUrl && (
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
                src={sceneAudioUrl}
                onEnded={() => setIsPlaying(false)}
                onError={() => message.warning('音频加载失败，CDN 可能尚未同步')}
              />
            </div>
          )}

          {/* Scene metadata */}
          <div style={{ marginTop: 20 }}>
            <Space wrap>
              <Tag color="blue">ID: {sceneData.id}</Tag>
              <Tag color="green">{sceneData.category}</Tag>
              <Tag>{sceneData.words.length} 个单词</Tag>
              {sceneData.collocations?.length > 0 && (
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

            <Panel header="📖 搭配短语" key="collocations">
              {sceneData.collocations?.map((c, i) => (
                <div key={i} style={{ padding: '4px 0' }}>
                  <Text strong>{c.phrase}</Text>
                  <Text type="secondary" style={{ marginLeft: 8 }}>{c.meaning}</Text>
                </div>
              ))}
            </Panel>

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
        </Card>
      )}
    </div>
  );
};

export default DifyGenerator;
