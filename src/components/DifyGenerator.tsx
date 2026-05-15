import React, { useState, useRef } from 'react';
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
  Radio,
  List,
  Tag,
  Progress,
  Result,
  Image,
} from 'antd';
import {
  ArrowLeftOutlined,
  UploadOutlined,
  RocketOutlined,
  CheckCircleOutlined,
  EditOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  FileImageOutlined,
  ThunderboltOutlined,
} from '@ant-design/icons';
import ScenePreview, { SceneData } from './ScenePreview';

const { Text, Title, Link } = Typography;

// Dify Cloud API
const DIFY_BASE_URL = 'https://api.dify.ai/v1';
const DIFY_API_KEY_STORAGE = 'dify-scene-generator-api-key';

// CDN base (jsDelivr mirror)
const CDN_BASE = 'https://cdn.jsdmirror.com/gh/techinsblog/cdn/en';

interface DifyGeneratorProps {
  onBack: () => void;
  onEditScene?: (sceneData: any) => void;
}

// Batch item status
type BatchItemStatus = 'pending' | 'uploading' | 'generating' | 'loading' | 'success' | 'failed';

interface BatchItem {
  id: string;
  file: File;
  preview: string;
  status: BatchItemStatus;
  progress: string;
  sceneId?: number;
  sceneTitle?: string;
  sceneData?: SceneData;
  error?: string;
}

interface BatchSummary {
  total: number;
  success: number;
  failed: number;
  items: BatchItem[];
}

const DifyGenerator: React.FC<DifyGeneratorProps> = ({ onBack, onEditScene }) => {
  const [apiKey, setApiKey] = useState<string>(
    () => localStorage.getItem(DIFY_API_KEY_STORAGE) || ''
  );
  // Mode: single or batch
  const [mode, setMode] = useState<'single' | 'batch'>('single');

  // Single mode state
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreview, setImagePreview] = useState<string>('');
  const [title, setTitle] = useState('');
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [sceneData, setSceneData] = useState<SceneData | null>(null);
  const [sceneImageUrl, setSceneImageUrl] = useState('');
  const [sceneAudioUrl, setSceneAudioUrl] = useState('');

  // Batch mode state
  const [batchFiles, setBatchFiles] = useState<BatchItem[]>([]);
  const [batchRunning, setBatchRunning] = useState(false);
  const [batchCurrentIndex, setBatchCurrentIndex] = useState(-1);
  const [batchSummary, setBatchSummary] = useState<BatchSummary | null>(null);
  const abortRef = useRef(false);

  const saveApiKey = (key: string) => {
    setApiKey(key);
    localStorage.setItem(DIFY_API_KEY_STORAGE, key);
  };

  // ==== Single Mode Logic ====
  const handleImageSelect = (file: File) => {
    setImageFile(file);
    setImagePreview(URL.createObjectURL(file));
    return false;
  };

  const uploadAndGenerate = async (
    file: File,
    inputTitle?: string,
    onProgress?: (msg: string) => void
  ): Promise<{ sceneId: number; sceneData: SceneData }> => {
    const report = onProgress || (() => {});

    // Step 1: Upload file to Dify
    report('正在上传图片...');
    const uploadForm = new FormData();
    uploadForm.append('file', file);
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

    // Step 2: Run workflow
    report('正在调用 AI 工作流生成场景数据...');
    const inputs: Record<string, any> = {
      image: {
        type: 'image',
        transfer_method: 'local_file',
        upload_file_id: fileId,
      },
    };
    if (inputTitle?.trim()) inputs.title = inputTitle.trim();

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

    const sceneId = parseInt(outputs.scene_id);
    if (!sceneId) {
      throw new Error('无法获取场景 ID');
    }

    // Step 3: Fetch scene JSON from CDN with retry
    report('生成成功，正在加载 CDN 预览...');
    const jsonUrl = `${CDN_BASE}/data/scenes/${sceneId}.json?_t=${Date.now()}`;

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
      report(`CDN 同步中，等待第 ${attempt + 2} 次尝试...`);
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

    return { sceneId, sceneData: sceneJson };
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
      const result = await uploadAndGenerate(imageFile, title, (msg) => setProgress(msg));
      setSceneData(result.sceneData);
      setSceneImageUrl(`${CDN_BASE}/img/scene-${result.sceneId}.webp?_t=${Date.now()}`);
      setSceneAudioUrl(`${CDN_BASE}/audio/scene-${result.sceneId}.mp3?_t=${Date.now()}`);
      setProgress('');
      message.success(`🎉 场景 ${result.sceneId}「${result.sceneData.title}」生成成功！`);
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

  // ==== Batch Mode Logic ====
  const handleBatchFileSelect = (file: File) => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const preview = URL.createObjectURL(file);
    setBatchFiles((prev) => [
      ...prev,
      { id, file, preview, status: 'pending', progress: '等待中' },
    ]);
    return false;
  };

  const removeBatchFile = (id: string) => {
    setBatchFiles((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.preview);
      return prev.filter((i) => i.id !== id);
    });
  };

  const clearBatchFiles = () => {
    batchFiles.forEach((item) => URL.revokeObjectURL(item.preview));
    setBatchFiles([]);
    setBatchSummary(null);
    setBatchCurrentIndex(-1);
  };

  const runBatch = async () => {
    if (!apiKey.trim()) {
      message.error('请先配置 Dify API Key');
      return;
    }
    if (batchFiles.length === 0) {
      message.error('请先添加图片');
      return;
    }

    setBatchRunning(true);
    setBatchSummary(null);
    abortRef.current = false;

    // Reset all items to pending
    setBatchFiles((prev) =>
      prev.map((item) => ({ ...item, status: 'pending' as BatchItemStatus, progress: '等待中', error: undefined, sceneId: undefined, sceneTitle: undefined, sceneData: undefined }))
    );

    const results: BatchItem[] = [...batchFiles];

    for (let i = 0; i < results.length; i++) {
      if (abortRef.current) break;

      setBatchCurrentIndex(i);

      // Update status to uploading
      const updateItem = (patch: Partial<BatchItem>) => {
        setBatchFiles((prev) =>
          prev.map((item, idx) => (idx === i ? { ...item, ...patch } : item))
        );
        results[i] = { ...results[i], ...patch };
      };

      updateItem({ status: 'uploading', progress: '正在上传图片...' });

      try {
        const result = await uploadAndGenerate(
          results[i].file,
          undefined, // batch mode: no manual title
          (msg) => {
            const status: BatchItemStatus = msg.includes('上传')
              ? 'uploading'
              : msg.includes('工作流')
              ? 'generating'
              : 'loading';
            updateItem({ status, progress: msg });
          }
        );

        updateItem({
          status: 'success',
          progress: '生成成功',
          sceneId: result.sceneId,
          sceneTitle: result.sceneData.title,
          sceneData: result.sceneData,
        });
      } catch (e: any) {
        updateItem({
          status: 'failed',
          progress: '失败',
          error: e.message || '未知错误',
        });
      }
    }

    setBatchCurrentIndex(-1);
    setBatchRunning(false);

    // Build summary
    const finalItems = results;
    const successCount = finalItems.filter((i) => i.status === 'success').length;
    const failedCount = finalItems.filter((i) => i.status === 'failed').length;

    setBatchSummary({
      total: finalItems.length,
      success: successCount,
      failed: failedCount,
      items: finalItems,
    });

    if (failedCount === 0) {
      message.success(`🎉 全部 ${successCount} 个场景生成成功！`);
    } else {
      message.warning(`完成：${successCount} 成功，${failedCount} 失败`);
    }
  };

  const stopBatch = () => {
    abortRef.current = true;
    message.info('正在停止批量生成...');
  };

  // ==== Status helpers ====
  const getStatusTag = (status: BatchItemStatus) => {
    switch (status) {
      case 'pending':
        return <Tag icon={<ClockCircleOutlined />} color="default">等待中</Tag>;
      case 'uploading':
        return <Tag icon={<LoadingOutlined />} color="processing">上传中</Tag>;
      case 'generating':
        return <Tag icon={<LoadingOutlined />} color="processing">生成中</Tag>;
      case 'loading':
        return <Tag icon={<LoadingOutlined />} color="processing">加载中</Tag>;
      case 'success':
        return <Tag icon={<CheckCircleOutlined />} color="success">成功</Tag>;
      case 'failed':
        return <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>;
    }
  };

  // ==== Render ====
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
          上传场景图片，AI 自动识别场景分类并生成词汇数据、音频，直接提交到 GitHub。
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

        {/* Mode Switch */}
        <div style={{ marginBottom: 24 }}>
          <Radio.Group
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            optionType="button"
            buttonStyle="solid"
            disabled={generating || batchRunning}
          >
            <Radio.Button value="single">
              <FileImageOutlined /> 单张生成
            </Radio.Button>
            <Radio.Button value="batch">
              <ThunderboltOutlined /> 批量生成
            </Radio.Button>
          </Radio.Group>
        </div>

        {/* ==== Single Mode ==== */}
        {mode === 'single' && (
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
        )}

        {/* ==== Batch Mode ==== */}
        {mode === 'batch' && (
          <Space direction="vertical" size="middle" style={{ width: '100%' }}>
            <div>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                选择多张场景图片（标题由 AI 自动生成）
              </Text>
              <Upload
                accept="image/*"
                multiple
                beforeUpload={handleBatchFileSelect}
                showUploadList={false}
                disabled={batchRunning}
              >
                <Button icon={<UploadOutlined />} disabled={batchRunning}>
                  添加图片
                </Button>
              </Upload>
            </div>

            {/* Batch file list */}
            {batchFiles.length > 0 && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <Text strong>已选图片（{batchFiles.length} 张）</Text>
                  {!batchRunning && (
                    <Button size="small" danger onClick={clearBatchFiles}>
                      清空
                    </Button>
                  )}
                </div>

                {/* Progress bar when running */}
                {batchRunning && batchCurrentIndex >= 0 && (
                  <div style={{ marginBottom: 12 }}>
                    <Progress
                      percent={Math.round(((batchCurrentIndex + 1) / batchFiles.length) * 100)}
                      format={() => `${batchCurrentIndex + 1} / ${batchFiles.length}`}
                      status="active"
                    />
                  </div>
                )}

                <List
                  size="small"
                  bordered
                  dataSource={batchFiles}
                  style={{ maxHeight: 400, overflow: 'auto' }}
                  renderItem={(item, index) => (
                    <List.Item
                      style={{
                        background: batchRunning && index === batchCurrentIndex ? '#e6f7ff' : undefined,
                      }}
                      actions={
                        !batchRunning
                          ? [
                              <Button
                                type="link"
                                danger
                                size="small"
                                onClick={() => removeBatchFile(item.id)}
                              >
                                移除
                              </Button>,
                            ]
                          : undefined
                      }
                    >
                      <List.Item.Meta
                        avatar={
                          <Image
                            src={item.preview}
                            width={48}
                            height={48}
                            style={{ objectFit: 'cover', borderRadius: 4 }}
                            preview={false}
                          />
                        }
                        title={
                          <Space>
                            <Text ellipsis style={{ maxWidth: 200 }}>
                              {item.file.name}
                            </Text>
                            {getStatusTag(item.status)}
                          </Space>
                        }
                        description={
                          <span>
                            {item.status === 'success' && item.sceneTitle && (
                              <Text type="success">
                                ID: {item.sceneId} — {item.sceneTitle}
                              </Text>
                            )}
                            {item.status === 'failed' && (
                              <Text type="danger">{item.error}</Text>
                            )}
                            {!['success', 'failed'].includes(item.status) && item.status !== 'pending' && (
                              <Text type="secondary">{item.progress}</Text>
                            )}
                          </span>
                        }
                      />
                    </List.Item>
                  )}
                />
              </div>
            )}

            {/* Action buttons */}
            <Space>
              {!batchRunning ? (
                <Button
                  type="primary"
                  size="large"
                  icon={<RocketOutlined />}
                  onClick={runBatch}
                  disabled={batchFiles.length === 0 || !apiKey}
                >
                  批量生成（{batchFiles.length} 张）
                </Button>
              ) : (
                <Button
                  danger
                  size="large"
                  onClick={stopBatch}
                >
                  停止生成
                </Button>
              )}
            </Space>
          </Space>
        )}
      </Card>

      {/* ==== Single Mode Preview ==== */}
      {mode === 'single' && sceneData && (
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

      {/* ==== Batch Summary ==== */}
      {mode === 'batch' && batchSummary && !batchRunning && (
        <Card title="📊 批量生成汇总" style={{ marginTop: 24 }}>
          <Result
            status={batchSummary.failed === 0 ? 'success' : 'warning'}
            title={
              batchSummary.failed === 0
                ? `全部 ${batchSummary.success} 个场景生成成功！`
                : `完成：${batchSummary.success} 成功，${batchSummary.failed} 失败`
            }
            subTitle={`共处理 ${batchSummary.total} 张图片`}
          />

          {/* Success list */}
          {batchSummary.items.filter((i) => i.status === 'success').length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Title level={5} style={{ color: '#52c41a' }}>
                ✅ 成功（{batchSummary.success}）
              </Title>
              <List
                size="small"
                bordered
                dataSource={batchSummary.items.filter((i) => i.status === 'success')}
                renderItem={(item) => (
                  <List.Item
                    actions={[
                      <Link
                        href={`${CDN_BASE}/data/scenes/${item.sceneId}.json`}
                        target="_blank"
                        key="json"
                      >
                        JSON
                      </Link>,
                      <Link
                        href={`${CDN_BASE}/img/scene-${item.sceneId}.webp`}
                        target="_blank"
                        key="img"
                      >
                        图片
                      </Link>,
                    ]}
                  >
                    <List.Item.Meta
                      avatar={
                        <Image
                          src={item.preview}
                          width={40}
                          height={40}
                          style={{ objectFit: 'cover', borderRadius: 4 }}
                          preview={false}
                        />
                      }
                      title={`场景 ${item.sceneId} — ${item.sceneTitle}`}
                      description={item.file.name}
                    />
                  </List.Item>
                )}
              />
            </div>
          )}

          {/* Failed list */}
          {batchSummary.items.filter((i) => i.status === 'failed').length > 0 && (
            <div style={{ marginTop: 16 }}>
              <Title level={5} style={{ color: '#ff4d4f' }}>
                ❌ 失败（{batchSummary.failed}）
              </Title>
              <List
                size="small"
                bordered
                dataSource={batchSummary.items.filter((i) => i.status === 'failed')}
                renderItem={(item) => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        <Image
                          src={item.preview}
                          width={40}
                          height={40}
                          style={{ objectFit: 'cover', borderRadius: 4 }}
                          preview={false}
                        />
                      }
                      title={item.file.name}
                      description={<Text type="danger">{item.error}</Text>}
                    />
                  </List.Item>
                )}
              />
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

export default DifyGenerator;
