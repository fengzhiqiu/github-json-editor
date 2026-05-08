import React, { useEffect, useState, useRef } from 'react';
import {
  Card,
  List,
  Button,
  Typography,
  Space,
  Tag,
  Spin,
  Empty,
  message,
  Tabs,
  Row,
  Col,
  Image,
  Popconfirm,
  Pagination,
  Upload,
  Modal,
} from 'antd';
import {
  FileTextOutlined,
  ReloadOutlined,
  ArrowLeftOutlined,
  CloudDownloadOutlined,
  PictureOutlined,
  DeleteOutlined,
  SwapOutlined,
  UploadOutlined,
} from '@ant-design/icons';
import { RepoConfig, GitHubFile } from '../types';
import { useGitHub } from '../hooks/useGitHub';
import { isImageFile } from '../utils/github';
import imageCompression from 'browser-image-compression';

const { Text } = Typography;

interface FileListProps {
  repoConfig: RepoConfig;
  onSelectFile: (file: GitHubFile) => void;
  onBack: () => void;
}

const PAGE_SIZE = 20;

const FileList: React.FC<FileListProps> = ({ repoConfig, onSelectFile, onBack }) => {
  const [jsonFiles, setJsonFiles] = useState<GitHubFile[]>([]);
  const [imageFiles, setImageFiles] = useState<GitHubFile[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [activeTab, setActiveTab] = useState('json');
  const [uploading, setUploading] = useState(false);
  const { loading, fetchFiles, fetchAllFiles, uploadImage, deleteFile } = useGitHub();
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replacingFile, setReplacingFile] = useState<GitHubFile | null>(null);

  const loadFiles = async () => {
    try {
      const allFiles = await fetchAllFiles(repoConfig);
      setJsonFiles(allFiles.filter((f) => f.name.endsWith('.json')));
      setImageFiles(allFiles.filter((f) => isImageFile(f.name)));
    } catch (e) {
      message.error('加载文件列表失败: ' + (e as Error).message);
    }
  };

  useEffect(() => {
    loadFiles();
  }, [repoConfig]);

  const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getImageUrl = (file: GitHubFile): string => {
    if (file.download_url) return file.download_url;
    return `https://raw.githubusercontent.com/${repoConfig.owner}/${repoConfig.repo}/${repoConfig.branch}/${file.path}`;
  };

  const compressImageFile = async (file: File): Promise<File> => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    };
    return await imageCompression(file, options);
  };

  const handleUploadImages = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const compressed = await compressImageFile(file);
        const arrayBuffer = await compressed.arrayBuffer();
        const filePath = `${repoConfig.path}/${file.name}`;

        // Check if file already exists
        const existingFile = imageFiles.find((f) => f.name === file.name);
        if (existingFile) {
          const confirmed = await new Promise<boolean>((resolve) => {
            Modal.confirm({
              title: '文件已存在',
              content: `"${file.name}" 已存在，是否覆盖？`,
              okText: '覆盖',
              cancelText: '跳过',
              onOk: () => resolve(true),
              onCancel: () => resolve(false),
            });
          });
          if (!confirmed) continue;

          await uploadImage(
            repoConfig.owner,
            repoConfig.repo,
            filePath,
            arrayBuffer,
            `Replace image: ${file.name}`,
            repoConfig.branch,
            existingFile.sha
          );
        } else {
          await uploadImage(
            repoConfig.owner,
            repoConfig.repo,
            filePath,
            arrayBuffer,
            `Upload image: ${file.name}`,
            repoConfig.branch
          );
        }
      }
      message.success('图片上传完成');
      await loadFiles();
    } catch (e) {
      message.error('上传失败: ' + (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteImage = async (file: GitHubFile) => {
    try {
      await deleteFile(
        repoConfig.owner,
        repoConfig.repo,
        file.path,
        file.sha,
        `Delete image: ${file.name}`,
        repoConfig.branch
      );
      message.success(`已删除 ${file.name}`);
      setImageFiles((prev) => prev.filter((f) => f.sha !== file.sha));
    } catch (e) {
      message.error('删除失败: ' + (e as Error).message);
    }
  };

  const handleReplaceImage = (file: GitHubFile) => {
    setReplacingFile(file);
    replaceInputRef.current?.click();
  };

  const handleReplaceFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replacingFile) return;

    setUploading(true);
    try {
      const compressed = await compressImageFile(file);
      const arrayBuffer = await compressed.arrayBuffer();

      await uploadImage(
        repoConfig.owner,
        repoConfig.repo,
        replacingFile.path,
        arrayBuffer,
        `Replace image: ${replacingFile.name}`,
        repoConfig.branch,
        replacingFile.sha
      );
      message.success(`已替换 ${replacingFile.name}`);
      await loadFiles();
    } catch (err) {
      message.error('替换失败: ' + (err as Error).message);
    } finally {
      setUploading(false);
      setReplacingFile(null);
      if (replaceInputRef.current) {
        replaceInputRef.current.value = '';
      }
    }
  };

  // Pagination
  const paginatedImages = imageFiles.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const renderJsonTab = () => (
    <>
      {loading && jsonFiles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">加载中...</Text>
          </div>
        </div>
      ) : jsonFiles.length === 0 ? (
        <Empty description="该目录下没有 JSON 文件" />
      ) : (
        <List
          dataSource={jsonFiles}
          renderItem={(file) => (
            <List.Item
              actions={[
                <Button
                  type="primary"
                  size="small"
                  icon={<CloudDownloadOutlined />}
                  onClick={() => onSelectFile(file)}
                  key="edit"
                >
                  编辑
                </Button>,
              ]}
              style={{ cursor: 'pointer' }}
              onClick={() => onSelectFile(file)}
            >
              <List.Item.Meta
                avatar={<FileTextOutlined style={{ fontSize: 24, color: '#1677ff' }} />}
                title={<Text strong>{file.name}</Text>}
                description={
                  <Space size="small">
                    <Tag>{formatSize(file.size)}</Tag>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {file.path}
                    </Text>
                  </Space>
                }
              />
            </List.Item>
          )}
        />
      )}
    </>
  );

  const renderImageTab = () => (
    <>
      <div style={{ marginBottom: 16 }}>
        <Upload
          accept="image/jpg,image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
          multiple
          showUploadList={false}
          beforeUpload={(_file, fileList) => {
            // Use the native file list from the input
            const dataTransfer = new DataTransfer();
            fileList.forEach((f) => dataTransfer.items.add(f as unknown as File));
            handleUploadImages(dataTransfer.files);
            return false;
          }}
          disabled={uploading}
        >
          <Button
            type="primary"
            icon={<UploadOutlined />}
            loading={uploading}
          >
            上传图片
          </Button>
        </Upload>
      </div>

      {loading && imageFiles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">加载中...</Text>
          </div>
        </div>
      ) : imageFiles.length === 0 ? (
        <Empty description="该目录下没有图片文件" image={Empty.PRESENTED_IMAGE_SIMPLE} />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {paginatedImages.map((file) => (
              <Col xs={12} sm={8} md={6} key={file.sha}>
                <Card
                  hoverable
                  size="small"
                  cover={
                    <div style={{ height: 160, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
                      <Image
                        src={getImageUrl(file)}
                        alt={file.name}
                        style={{ maxHeight: 160, maxWidth: '100%', objectFit: 'contain' }}
                        preview={true}
                        fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iIGZpbGw9IiNjY2MiIGZvbnQtc2l6ZT0iMTIiPuWKoOi9veWksei0pTwvdGV4dD48L3N2Zz4="
                      />
                    </div>
                  }
                  actions={[
                    <Button
                      type="text"
                      size="small"
                      icon={<SwapOutlined />}
                      onClick={() => handleReplaceImage(file)}
                      key="replace"
                    >
                      替换
                    </Button>,
                    <Popconfirm
                      title="确认删除"
                      description={`确定要删除 "${file.name}" 吗？`}
                      onConfirm={() => handleDeleteImage(file)}
                      okText="删除"
                      cancelText="取消"
                      okButtonProps={{ danger: true }}
                      key="delete"
                    >
                      <Button
                        type="text"
                        size="small"
                        danger
                        icon={<DeleteOutlined />}
                      >
                        删除
                      </Button>
                    </Popconfirm>,
                  ]}
                >
                  <Card.Meta
                    description={
                      <Text
                        ellipsis={{ tooltip: file.name }}
                        style={{ fontSize: 12 }}
                      >
                        {file.name}
                      </Text>
                    }
                  />
                </Card>
              </Col>
            ))}
          </Row>

          {imageFiles.length > PAGE_SIZE && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <Pagination
                current={currentPage}
                pageSize={PAGE_SIZE}
                total={imageFiles.length}
                onChange={(page) => setCurrentPage(page)}
                showSizeChanger={false}
                showTotal={(total) => `共 ${total} 张图片`}
              />
            </div>
          )}
        </>
      )}

      {/* Hidden input for replace */}
      <input
        type="file"
        ref={replaceInputRef}
        style={{ display: 'none' }}
        accept="image/*"
        onChange={handleReplaceFileSelected}
      />
    </>
  );

  return (
    <Card
      title={
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} />
          <FileTextOutlined />
          <span>{repoConfig.label || `${repoConfig.owner}/${repoConfig.repo}`}</span>
          <Tag color="geekblue">{repoConfig.path}</Tag>
        </Space>
      }
      extra={
        <Button icon={<ReloadOutlined />} onClick={loadFiles} loading={loading}>
          刷新
        </Button>
      }
      style={{ borderRadius: 8 }}
    >
      <Tabs
        activeKey={activeTab}
        onChange={(key) => {
          setActiveTab(key);
          if (key === 'images') setCurrentPage(1);
        }}
        items={[
          {
            key: 'json',
            label: (
              <span>
                <FileTextOutlined /> JSON 文件
              </span>
            ),
            children: renderJsonTab(),
          },
          {
            key: 'images',
            label: (
              <span>
                <PictureOutlined /> 图片管理
              </span>
            ),
            children: renderImageTab(),
          },
        ]}
      />
    </Card>
  );
};

export default FileList;
