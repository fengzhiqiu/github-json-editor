import React, { useState, useEffect } from 'react';
import {
  Card,
  Upload,
  Input,
  Button,
  message,
  Typography,
  Space,
  Spin,
  Divider,
} from 'antd';
import {
  ArrowLeftOutlined,
  UploadOutlined,
  RocketOutlined,
  CheckCircleOutlined,
  EditOutlined,
} from '@ant-design/icons';
import ScenePreview, { SceneData } from './ScenePreview';

const { Text } = Typography;

// Dify Cloud API
const DIFY_BASE_URL = 'https://api.dify.ai/v1';
const DIFY_API_KEY_STORAGE = 'dify-scene-generator-api-key';

// CDN base (jsDelivr mirror)
const CDN_BASE = 'https://cdn.jsdmirror.com/gh/techinsblog/cdn/en';

interface DifyGeneratorProps {
  onBack: () => void;
  onEditScene?: (sceneData: any) => void;
}

const DifyGenerator: React.FC<DifyGeneratorProps> = ({ onBack, onEditScene }) => {
  const [apiKey, setApiKey] = useState<string>(
    () => localStorage.getItem(DIFY_API_KEY_STORAGE) || ''
  );
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [title, setTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [sceneImageUrl, setSceneImageUrl] = useState('');
  const [sceneAudioUrl, setSceneAudioUrl] = useState('');


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
          上传一张场景图片，AI 自动识别场景分类并生成词汇数据、音频，直接提交到 GitHub。
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
            disabled={!imageFile || !apiKey}
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
          <ScenePreview
            sceneData={sceneData}
            imageUrl={sceneImageUrl}
            audioUrl={sceneAudioUrl}
          />
        </Card>
      )}
    </div>
  );
};

export default DifyGenerator;
