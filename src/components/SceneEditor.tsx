import React, { useState, useRef, useEffect } from 'react';
import {
  Card,
  Input,
  Select,
  Button,
  Space,
  Divider,
  Tag,
  InputNumber,
  Upload,
  message,
  Typography,
  ColorPicker,
  Row,
  Col,
  Spin,
} from 'antd';
import {
  ArrowLeftOutlined,
  DeleteOutlined,
  SoundOutlined,
  PictureOutlined,
} from '@ant-design/icons';
import { RepoConfig } from '../types';
import * as github from '../utils/github';
import imageCompression from 'browser-image-compression';

const { Text } = Typography;

interface SceneEditorProps {
  repoConfig: RepoConfig;
  onBack: () => void;
}

interface WordItem {
  id: string;
  text: string;
  zhText: string;
  phonetic: string;
  pos: string;
  meaning: string;
  example: { en: string; zh: string };
  synonyms: string[];
  position: { x: number; y: number };
}

interface CollocationItem {
  phrase: string;
  meaning: string;
}

const CDN_BASE = 'https://cdn.jsdmirror.com/gh/techinsblog/cdn';
const CATEGORIES_URL = `${CDN_BASE}/en/data/categories.json`;

interface CategoryItem {
  id: string;
  name: string;
  emoji: string;
  sort: number;
}

const SceneEditor: React.FC<SceneEditorProps> = ({ repoConfig, onBack }) => {
  const [submitting, setSubmitting] = useState(false);
  const [previewVisible, setPreviewVisible] = useState(false);

  // Categories (loaded from CDN)
  const [categories, setCategories] = useState<CategoryItem[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);

  // Basic info
  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string>('');
  const [gradientColors, setGradientColors] = useState<[string, string, string]>([
    '#667eea', '#764ba2', '#f093fb',
  ]);

  // Image
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('');
  const [imageCdnUrl, setImageCdnUrl] = useState<string>('');
  const [imageUploading, setImageUploading] = useState(false);

  // Audio
  const [audioCdnUrl, setAudioCdnUrl] = useState<string>('');
  const [audioUploading, setAudioUploading] = useState(false);
  const [audioPreviewUrl, setAudioPreviewUrl] = useState<string>('');

  // Sentence
  const [sentenceEn, setSentenceEn] = useState('');
  const [sentenceZh, setSentenceZh] = useState('');
  const [highlights, setHighlights] = useState<string[]>([]);
  const [highlightInput, setHighlightInput] = useState('');

  // Words
  const [words, setWords] = useState<WordItem[]>([]);

  // Collocations
  const [collocations, setCollocations] = useState<CollocationItem[]>([]);

  // Next ID
  const [nextId, setNextId] = useState<number | null>(null);
  const [loadingId, setLoadingId] = useState(true);

  // Position picker
  const [activeWordIndex, setActiveWordIndex] = useState<number | null>(null);

  // Synonym input per word
  const [synInputs, setSynInputs] = useState<Record<number, string>>({});

  useEffect(() => {
    fetchNextId();
    fetchCategories();
  }, []);

  const fetchCategories = async () => {
    setCategoriesLoading(true);
    try {
      const res = await fetch(CATEGORIES_URL + '?_t=' + Date.now());
      if (res.ok) {
        const data = await res.json();
        if (data.categories && data.categories.length) {
          setCategories(data.categories.sort((a: CategoryItem, b: CategoryItem) => a.sort - b.sort));
          setCategoriesLoading(false);
          return;
        }
      }
    } catch (e) {
      console.warn('Failed to load categories from CDN, trying GitHub API...');
    }
    // Fallback: load from GitHub API
    try {
      const content = await github.getFileContent('techinsblog', 'cdn', 'en/data/categories.json', 'main');
      const data = JSON.parse(content.content);
      if (data.categories && data.categories.length) {
        setCategories(data.categories.sort((a: CategoryItem, b: CategoryItem) => a.sort - b.sort));
      }
    } catch (e) {
      // Ultimate fallback: hardcoded
      setCategories([
        { id: 'daily', name: '日常', emoji: '☀️', sort: 1 },
        { id: 'food', name: '美食', emoji: '🍜', sort: 2 },
        { id: 'travel', name: '出行', emoji: '✈️', sort: 3 },
        { id: 'work', name: '职场', emoji: '💼', sort: 4 },
        { id: 'healing', name: '治愈', emoji: '🌿', sort: 5 },
        { id: 'sports', name: '运动', emoji: '🏃', sort: 6 },
        { id: 'shopping', name: '购物', emoji: '🛍️', sort: 7 },
        { id: 'social', name: '社交', emoji: '🎉', sort: 8 },
        { id: 'culture', name: '文化', emoji: '🎭', sort: 9 },
        { id: 'nature', name: '自然', emoji: '🌊', sort: 10 },
        { id: 'home', name: '居家', emoji: '🏠', sort: 11 },
        { id: 'health', name: '健康', emoji: '🏥', sort: 12 },
        { id: 'campus', name: '校园', emoji: '🎓', sort: 13 },
        { id: 'beauty', name: '美妆穿搭', emoji: '💄', sort: 14 },
        { id: 'pets', name: '萌宠', emoji: '🐾', sort: 15 },
        { id: 'creative', name: '手作文艺', emoji: '✨', sort: 16 },
      ]);
    }
    setCategoriesLoading(false);
  };

  const fetchNextId = async () => {
    setLoadingId(true);
    try {
      const content = await github.getFileContent(
        'techinsblog', 'cdn', 'en/data/scenes.json', 'main'
      );
      const data = JSON.parse(content.content);
      const scenes = data.scenes || data;
      const maxId = Array.isArray(scenes)
        ? scenes.reduce((max: number, s: any) => Math.max(max, s.id || 0), 0)
        : 0;
      setNextId(maxId + 1);
    } catch (e) {
      message.error('无法读取 scenes.json: ' + (e as Error).message);
      setNextId(1);
    } finally {
      setLoadingId(false);
    }
  };

  const getGradientString = () =>
    `linear-gradient(135deg, ${gradientColors[0]} 0%, ${gradientColors[1]} 50%, ${gradientColors[2]} 100%)`;

  const convertToWebP = (file: File | Blob): Promise<Blob> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) { reject(new Error('Canvas error')); return; }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            URL.revokeObjectURL(url);
            if (blob) resolve(blob);
            else reject(new Error('WebP conversion failed'));
          },
          'image/webp',
          0.85
        );
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load error')); };
      img.src = url;
    });
  };

  const handleImageSelect = async (file: File) => {
    setImagePreviewUrl(URL.createObjectURL(file));
    setImageUploading(true);
    try {
      const compressed = await imageCompression(file, {
        maxSizeMB: 0.2,
        maxWidthOrHeight: 1920,
        useWebWorker: true,
      });
      const webpBlob = await convertToWebP(compressed);
      const baseName = file.name.replace(/\.[^.]+$/, '');
      const filename = `${baseName}-${Date.now().toString(36)}.webp`;
      const arrayBuffer = await webpBlob.arrayBuffer();
      await github.uploadImage(
        'techinsblog', 'cdn', `en/img/${filename}`,
        arrayBuffer, `Add scene image: ${filename}`, 'main'
      );
      const cdnUrl = `${CDN_BASE}/en/img/${filename}`;
      setImageCdnUrl(cdnUrl);
      message.success('图片上传成功！');
    } catch (e) {
      message.error('图片上传失败: ' + (e as Error).message);
    } finally {
      setImageUploading(false);
    }
  };

  const handleAudioSelect = async (file: File) => {
    if (!nextId) { message.warning('正在获取场景 ID，请稍后再试'); return; }
    setAudioPreviewUrl(URL.createObjectURL(file));
    setAudioUploading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const audioFilename = `scene-${nextId}.mp3`;
      await github.uploadImage(
        'techinsblog', 'cdn', `en/audio/${audioFilename}`,
        arrayBuffer, `Add scene audio: ${audioFilename}`, 'main'
      );
      const cdnUrl = `${CDN_BASE}/en/audio/${audioFilename}`;
      setAudioCdnUrl(cdnUrl);
      message.success('音频上传成功！');
    } catch (e) {
      message.error('音频上传失败: ' + (e as Error).message);
    } finally {
      setAudioUploading(false);
    }
  };

  const handleWordClick = (word: string) => {
    const cleaned = word.replace(/[.,!?;:'"()]/g, '').toLowerCase();
    if (!cleaned) return;
    if (highlights.includes(cleaned)) {
      setHighlights(highlights.filter((h) => h !== cleaned));
    } else {
      setHighlights([...highlights, cleaned]);
    }
  };

  const addHighlight = () => {
    const trimmed = highlightInput.trim().toLowerCase();
    if (trimmed && !highlights.includes(trimmed)) {
      setHighlights([...highlights, trimmed]);
    }
    setHighlightInput('');
  };

  const addWord = () => {
    setWords([...words, {
      id: '', text: '', zhText: '', phonetic: '', pos: '', meaning: '',
      example: { en: '', zh: '' }, synonyms: [], position: { x: 50, y: 50 },
    }]);
  };

  const updateWord = (index: number, field: string, value: any) => {
    const newWords = [...words];
    if (field.includes('.')) {
      const [parent, child] = field.split('.');
      (newWords[index] as any)[parent][child] = value;
    } else {
      (newWords[index] as any)[field] = value;
    }
    setWords(newWords);
  };

  const removeWord = (index: number) => {
    setWords(words.filter((_, i) => i !== index));
    if (activeWordIndex === index) setActiveWordIndex(null);
  };

  const addSynonym = (wordIndex: number) => {
    const val = (synInputs[wordIndex] || '').trim();
    if (!val) return;
    const newWords = [...words];
    if (!newWords[wordIndex].synonyms.includes(val)) {
      newWords[wordIndex].synonyms.push(val);
    }
    setWords(newWords);
    setSynInputs({ ...synInputs, [wordIndex]: '' });
  };

  const removeSynonym = (wordIndex: number, synIndex: number) => {
    const newWords = [...words];
    newWords[wordIndex].synonyms.splice(synIndex, 1);
    setWords(newWords);
  };

  const addCollocation = () => {
    setCollocations([...collocations, { phrase: '', meaning: '' }]);
  };

  const updateCollocation = (index: number, field: keyof CollocationItem, value: string) => {
    const newCollocations = [...collocations];
    newCollocations[index][field] = value;
    setCollocations(newCollocations);
  };

  const removeCollocation = (index: number) => {
    setCollocations(collocations.filter((_, i) => i !== index));
  };

  const handleImageClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeWordIndex === null) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100);
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 100);
    updateWord(activeWordIndex, 'position.x', Math.max(0, Math.min(100, x)));
    updateWord(activeWordIndex, 'position.y', Math.max(0, Math.min(100, y)));
    setActiveWordIndex(null);
  };

  const buildSceneJson = () => {
    if (!nextId) return null;
    return {
      version: 1,
      id: nextId,
      title,
      image: imageCdnUrl,
      categoryId,
      gradient: getGradientString(),
      audioUrl: audioCdnUrl,
      sentence: { en: sentenceEn, zh: sentenceZh, highlights },
      words: words.map((w) => ({
        id: w.id || w.text.toLowerCase(),
        text: w.text,
        zhText: w.zhText,
        phonetic: w.phonetic,
        pos: w.pos,
        meaning: w.meaning,
        example: w.example,
        synonyms: w.synonyms,
        position: w.position,
      })),
      collocations: collocations.filter((c) => c.phrase.trim()),
    };
  };

  const buildIndexEntry = () => {
    if (!nextId) return null;
    return {
      id: nextId,
      title,
      image: imageCdnUrl,
      categoryId,
      gradient: getGradientString(),
      wordCount: words.length,
      previewWords: words.slice(0, 3).map((w) => w.text).join(' · '),
    };
  };

  const handleSubmit = async () => {
    if (!nextId) { message.error('场景 ID 未就绪'); return; }
    if (!title.trim()) { message.error('请填写场景标题'); return; }
    if (!categoryId) { message.error('请选择分类'); return; }
    if (!imageCdnUrl) { message.error('请上传场景图片'); return; }
    if (words.length === 0) { message.error('请至少添加一个单词'); return; }

    setSubmitting(true);
    try {
      const sceneDetail = buildSceneJson();
      const scenePath = `en/data/scenes/${nextId}.json`;
      await github.createFile(
        'techinsblog', 'cdn', scenePath,
        JSON.stringify(sceneDetail, null, 2),
        `Add scene ${nextId}: ${title}`, 'main'
      );

      await new Promise((r) => setTimeout(r, 1500));

      const indexContent = await github.getFileContent(
        'techinsblog', 'cdn', 'en/data/scenes.json', 'main'
      );
      const indexData = JSON.parse(indexContent.content);
      const newEntry = buildIndexEntry();

      if (indexData.scenes && Array.isArray(indexData.scenes)) {
        indexData.scenes.push(newEntry);
      } else if (Array.isArray(indexData)) {
        indexData.push(newEntry);
      } else {
        indexData.scenes = [newEntry];
      }

      await github.updateFile(
        'techinsblog', 'cdn', 'en/data/scenes.json',
        JSON.stringify(indexData, null, 2),
        indexContent.sha,
        `Update scenes: add scene ${nextId}`, 'main'
      );

      message.success(`🎉 场景 ${nextId} 创建成功！`);
      message.info(`CDN 地址: ${CDN_BASE}/en/data/scenes/${nextId}.json`, 5);
    } catch (e) {
      message.error('提交失败: ' + (e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loadingId) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">正在获取场景编号...</Text>
        </div>
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 900, margin: '0 auto' }}>
      <Card
        title={
          <Space>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} />
            <span>✨ 新增场景 (Scene #{nextId})</span>
          </Space>
        }
        style={{ borderRadius: 8 }}
      >
        {/* Section 1: Basic Info */}
        <Divider orientation="left">1. 基础信息</Divider>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <div style={{ marginBottom: 16 }}>
              <Text strong>场景标题</Text>
              <Input
                placeholder="输入场景标题"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                style={{ marginTop: 4 }}
              />
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div style={{ marginBottom: 16 }}>
              <Text strong>分类</Text>
              <Select
                placeholder="选择分类"
                value={categoryId || undefined}
                onChange={setCategoryId}
                loading={categoriesLoading}
                style={{ width: '100%', marginTop: 4 }}
                options={categories.map((c) => ({ label: `${c.emoji} ${c.name}`, value: c.id }))}
              />
            </div>
          </Col>
        </Row>

        <div style={{ marginBottom: 16 }}>
          <Text strong>渐变色</Text>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 8, flexWrap: 'wrap' }}>
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>起始</Text>
              <ColorPicker
                value={gradientColors[0]}
                onChange={(_, hex) => setGradientColors([hex, gradientColors[1], gradientColors[2]])}
              />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>中间</Text>
              <ColorPicker
                value={gradientColors[1]}
                onChange={(_, hex) => setGradientColors([gradientColors[0], hex, gradientColors[2]])}
              />
            </div>
            <div>
              <Text type="secondary" style={{ fontSize: 12, display: 'block' }}>结束</Text>
              <ColorPicker
                value={gradientColors[2]}
                onChange={(_, hex) => setGradientColors([gradientColors[0], gradientColors[1], hex])}
              />
            </div>
          </div>
          <div
            style={{
              marginTop: 8, height: 32, borderRadius: 8,
              background: getGradientString(), border: '1px solid #f0f0f0',
            }}
          />
        </div>

        {/* Section 2: Scene Image */}
        <Divider orientation="left">2. 场景图片</Divider>
        <div style={{ marginBottom: 16 }}>
          {!imagePreviewUrl ? (
            <Upload.Dragger
              accept="image/*"
              showUploadList={false}
              beforeUpload={(file) => { handleImageSelect(file); return false; }}
              disabled={imageUploading}
            >
              <p className="ant-upload-drag-icon">
                <PictureOutlined style={{ fontSize: 48, color: '#1677ff' }} />
              </p>
              <p className="ant-upload-text">点击或拖拽上传场景图片</p>
              <p className="ant-upload-hint">自动压缩为 WebP 格式，最大 200KB</p>
            </Upload.Dragger>
          ) : (
            <div>
              <div
                style={{
                  position: 'relative', border: '2px solid #f0f0f0',
                  borderRadius: 8, overflow: 'hidden',
                  cursor: activeWordIndex !== null ? 'crosshair' : 'default',
                }}
                onClick={handleImageClick}
              >
                <img src={imagePreviewUrl} alt="scene" style={{ width: '100%', display: 'block' }} />
                {words.map((w, idx) => (
                  <div
                    key={idx}
                    style={{
                      position: 'absolute',
                      left: `${w.position.x}%`, top: `${w.position.y}%`,
                      transform: 'translate(-50%, -50%)',
                      width: 24, height: 24, borderRadius: '50%',
                      background: activeWordIndex === idx ? '#ff4d4f' : '#1677ff',
                      color: '#fff', display: 'flex', alignItems: 'center',
                      justifyContent: 'center', fontSize: 10, fontWeight: 'bold',
                      border: '2px solid #fff', boxShadow: '0 2px 4px rgba(0,0,0,0.3)',
                      pointerEvents: 'none',
                    }}
                  >
                    {idx + 1}
                  </div>
                ))}
                {activeWordIndex !== null && (
                  <div style={{
                    position: 'absolute', top: 8, left: 8,
                    background: 'rgba(0,0,0,0.7)', color: '#fff',
                    padding: '4px 8px', borderRadius: 4, fontSize: 12,
                  }}>
                    点击图片设置单词 #{activeWordIndex + 1} 的位置
                  </div>
                )}
              </div>
              {imageUploading && (
                <div style={{ marginTop: 8 }}>
                  <Spin size="small" /> <Text type="secondary">上传中...</Text>
                </div>
              )}
              {imageCdnUrl && (
                <div style={{ marginTop: 8 }}>
                  <Tag color="green">✓ 已上传</Tag>
                  <Text copyable style={{ fontSize: 12 }}>{imageCdnUrl}</Text>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 3: Audio */}
        <Divider orientation="left">3. 例句音频</Divider>
        <div style={{ marginBottom: 16 }}>
          {!audioPreviewUrl ? (
            <Upload.Dragger
              accept=".mp3,audio/mpeg"
              showUploadList={false}
              beforeUpload={(file) => { handleAudioSelect(file); return false; }}
              disabled={audioUploading}
            >
              <p className="ant-upload-drag-icon">
                <SoundOutlined style={{ fontSize: 48, color: '#52c41a' }} />
              </p>
              <p className="ant-upload-text">点击或拖拽上传 MP3 音频</p>
              <p className="ant-upload-hint">将上传为 en/audio/scene-{nextId}.mp3</p>
            </Upload.Dragger>
          ) : (
            <div>
              <audio controls src={audioPreviewUrl} style={{ width: '100%' }} />
              {audioUploading && (
                <div style={{ marginTop: 8 }}>
                  <Spin size="small" /> <Text type="secondary">上传中...</Text>
                </div>
              )}
              {audioCdnUrl && (
                <div style={{ marginTop: 8 }}>
                  <Tag color="green">✓ 已上传</Tag>
                  <Text copyable style={{ fontSize: 12 }}>{audioCdnUrl}</Text>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 4: Sentence */}
        <Divider orientation="left">4. 例句</Divider>
        <Row gutter={16}>
          <Col xs={24} md={12}>
            <div style={{ marginBottom: 12 }}>
              <Text strong>英文例句</Text>
              <Input
                placeholder="The morning light filtered through the curtains."
                value={sentenceEn}
                onChange={(e) => setSentenceEn(e.target.value)}
                style={{ marginTop: 4 }}
              />
            </div>
          </Col>
          <Col xs={24} md={12}>
            <div style={{ marginBottom: 12 }}>
              <Text strong>中文翻译</Text>
              <Input
                placeholder="晨光透过窗帘洒了进来。"
                value={sentenceZh}
                onChange={(e) => setSentenceZh(e.target.value)}
                style={{ marginTop: 4 }}
              />
            </div>
          </Col>
        </Row>
        <div style={{ marginBottom: 16 }}>
          <Text strong>高亮词 </Text>
          <Text type="secondary" style={{ fontSize: 12 }}>(点击上方句中单词添加/移除)</Text>
          {sentenceEn && (
            <div style={{ marginTop: 8, marginBottom: 8 }}>
              {sentenceEn.split(/\s+/).map((word, idx) => {
                const cleaned = word.replace(/[.,!?;:'"()]/g, '').toLowerCase();
                const isHighlighted = highlights.includes(cleaned);
                return (
                  <Tag
                    key={idx}
                    color={isHighlighted ? 'blue' : undefined}
                    style={{ cursor: 'pointer', marginBottom: 4 }}
                    onClick={() => handleWordClick(word)}
                  >
                    {word}
                  </Tag>
                );
              })}
            </div>
          )}
          <Space.Compact style={{ width: '100%' }}>
            <Input
              placeholder="手动输入高亮词"
              value={highlightInput}
              onChange={(e) => setHighlightInput(e.target.value)}
              onPressEnter={addHighlight}
            />
            <Button onClick={addHighlight}>添加</Button>
          </Space.Compact>
          {highlights.length > 0 && (
            <div style={{ marginTop: 8 }}>
              {highlights.map((h, idx) => (
                <Tag key={idx} closable color="blue" onClose={() => setHighlights(highlights.filter((_, i) => i !== idx))}>
                  {h}
                </Tag>
              ))}
            </div>
          )}
        </div>

        {/* Section 5: Words */}
        <Divider orientation="left">5. 单词列表</Divider>
        {words.map((word, idx) => (
          <Card
            key={idx}
            size="small"
            style={{ marginBottom: 12, background: '#fafafa' }}
            title={<Space><span>单词 #{idx + 1}</span>{word.text && <Tag>{word.text}</Tag>}</Space>}
            extra={
              <Space>
                <Button
                  size="small"
                  type={activeWordIndex === idx ? 'primary' : 'default'}
                  onClick={() => setActiveWordIndex(activeWordIndex === idx ? null : idx)}
                  disabled={!imagePreviewUrl}
                >
                  📍 定位
                </Button>
                <Button size="small" danger icon={<DeleteOutlined />} onClick={() => removeWord(idx)} />
              </Space>
            }
          >
            <Row gutter={[12, 8]}>
              <Col xs={12} md={6}>
                <Input size="small" addonBefore="id" placeholder="sunset" value={word.id} onChange={(e) => updateWord(idx, 'id', e.target.value)} />
              </Col>
              <Col xs={12} md={6}>
                <Input size="small" addonBefore="text" placeholder="英文" value={word.text} onChange={(e) => updateWord(idx, 'text', e.target.value)} />
              </Col>
              <Col xs={12} md={6}>
                <Input size="small" addonBefore="中文" placeholder="中文" value={word.zhText} onChange={(e) => updateWord(idx, 'zhText', e.target.value)} />
              </Col>
              <Col xs={12} md={6}>
                <Input size="small" addonBefore="音标" placeholder="/wɜːrd/" value={word.phonetic} onChange={(e) => updateWord(idx, 'phonetic', e.target.value)} />
              </Col>
              <Col xs={12} md={6}>
                <Input size="small" addonBefore="词性" placeholder="n." value={word.pos} onChange={(e) => updateWord(idx, 'pos', e.target.value)} />
              </Col>
              <Col xs={12} md={6}>
                <Input size="small" addonBefore="释义" placeholder="含义" value={word.meaning} onChange={(e) => updateWord(idx, 'meaning', e.target.value)} />
              </Col>
              <Col xs={24} md={12}>
                <Input size="small" addonBefore="例句en" placeholder="Example sentence" value={word.example.en} onChange={(e) => updateWord(idx, 'example.en', e.target.value)} />
              </Col>
              <Col xs={24} md={12}>
                <Input size="small" addonBefore="例句zh" placeholder="例句翻译" value={word.example.zh} onChange={(e) => updateWord(idx, 'example.zh', e.target.value)} />
              </Col>
              <Col xs={12} md={6}>
                <InputNumber size="small" addonBefore="X" min={0} max={100} value={word.position.x} onChange={(v) => updateWord(idx, 'position.x', v || 0)} style={{ width: '100%' }} />
              </Col>
              <Col xs={12} md={6}>
                <InputNumber size="small" addonBefore="Y" min={0} max={100} value={word.position.y} onChange={(v) => updateWord(idx, 'position.y', v || 0)} style={{ width: '100%' }} />
              </Col>
              <Col xs={24} md={12}>
                <Space.Compact size="small" style={{ width: '100%' }}>
                  <Input
                    placeholder="添加同义词"
                    value={synInputs[idx] || ''}
                    onChange={(e) => setSynInputs({ ...synInputs, [idx]: e.target.value })}
                    onPressEnter={() => addSynonym(idx)}
                  />
                  <Button onClick={() => addSynonym(idx)}>+</Button>
                </Space.Compact>
                {word.synonyms.length > 0 && (
                  <div style={{ marginTop: 4 }}>
                    {word.synonyms.map((s, si) => (
                      <Tag key={si} closable onClose={() => removeSynonym(idx, si)} style={{ marginBottom: 2 }}>{s}</Tag>
                    ))}
                  </div>
                )}
              </Col>
            </Row>
          </Card>
        ))}
        <Button type="dashed" block onClick={addWord} style={{ marginBottom: 16 }}>
          + 添加单词
        </Button>

        {/* Section 6: Collocations */}
        <Divider orientation="left">6. 搭配短语</Divider>
        {collocations.map((col, idx) => (
          <Row gutter={12} key={idx} style={{ marginBottom: 8 }}>
            <Col flex="auto">
              <Space.Compact style={{ width: '100%' }}>
                <Input
                  placeholder="短语 (e.g. warm up)"
                  value={col.phrase}
                  onChange={(e) => updateCollocation(idx, 'phrase', e.target.value)}
                />
                <Input
                  placeholder="释义"
                  value={col.meaning}
                  onChange={(e) => updateCollocation(idx, 'meaning', e.target.value)}
                />
              </Space.Compact>
            </Col>
            <Col>
              <Button danger icon={<DeleteOutlined />} onClick={() => removeCollocation(idx)} />
            </Col>
          </Row>
        ))}
        <Button type="dashed" block onClick={addCollocation} style={{ marginBottom: 16 }}>
          + 添加搭配
        </Button>

        {/* Section 7: Preview & Submit */}
        <Divider orientation="left">7. 预览 & 提交</Divider>
        <Button
          block
          style={{ marginBottom: 12 }}
          onClick={() => setPreviewVisible(!previewVisible)}
        >
          {previewVisible ? '隐藏预览' : '📋 查看生成的 JSON'}
        </Button>
        {previewVisible && (
          <pre style={{
            background: '#f6f8fa', padding: 16, borderRadius: 8,
            fontSize: 12, overflow: 'auto', maxHeight: 400,
            border: '1px solid #e8e8e8', marginBottom: 16,
          }}>
            {JSON.stringify(buildSceneJson(), null, 2)}
          </pre>
        )}
        <Button
          type="primary"
          size="large"
          block
          loading={submitting}
          onClick={handleSubmit}
          disabled={!title || !categoryId || !imageCdnUrl || words.length === 0}
        >
          🚀 提交场景
        </Button>
      </Card>
    </div>
  );
};

export default SceneEditor;
