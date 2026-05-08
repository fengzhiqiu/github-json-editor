import React, { useEffect, useState, useRef } from 'react';
import {
  Card,
  Button,
  Typography,
  Space,
  Tag,
  Spin,
  Empty,
  message,
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
  DeleteOutlined,
  SwapOutlined,
  UploadOutlined,
  EditOutlined,
  FileOutlined,
  FilePdfOutlined,
  FileMarkdownOutlined,
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
  const [allFiles, setAllFiles] = useState<GitHubFile[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const { loading, fetchAllFiles, uploadImage, deleteFile } = useGitHub();
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replacingFile, setReplacingFile] = useState<GitHubFile | null>(null);

  const loadFiles = async () => {
    try {
      const files = await fetchAllFiles(repoConfig);
      setAllFiles(files);
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

  const getFileIcon = (filename: string) => {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.json')) return <FileTextOutlined style={{ fontSize: 36, color: '#1677ff' }} />;
    if (lower.endsWith('.md')) return <FileMarkdownOutlined style={{ fontSize: 36, color: '#52c41a' }} />;
    if (lower.endsWith('.pdf')) return <FilePdfOutlined style={{ fontSize: 36, color: '#f5222d' }} />;
    return <FileOutlined style={{ fontSize: 36, color: '#999' }} />;
  };

  const compressImageFile = async (file: File): Promise<File> => {
    const options = {
      maxSizeMB: 1,
      maxWidthOrHeight: 1920,
      useWebWorker: true,
    };
    try {
      return await imageCompression(file, options);
    } catch {
      // If compression fails (e.g. non-image), return original
      return file;
    }
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setUploading(true);

    try {
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        let arrayBuffer: ArrayBuffer;

        // Compress if it's an image
        if (isImageFile(file.name)) {
          const compressed = await compressImageFile(file);
          arrayBuffer = await compressed.arrayBuffer();
        } else {
          arrayBuffer = await file.arrayBuffer();
        }

        const filePath = `${repoConfig.path}/${file.name}`;

        // Check if file already exists
        const existingFile = allFiles.find((f) => f.name === file.name);
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
            `Replace: ${file.name}`,
            repoConfig.branch,
            existingFile.sha
          );
        } else {
          await uploadImage(
            repoConfig.owner,
            repoConfig.repo,
            filePath,
            arrayBuffer,
            `Upload: ${file.name}`,
            repoConfig.branch
          );
        }
      }
      message.success('上传完成');
      await loadFiles();
    } catch (e) {
      message.error('上传失败: ' + (e as Error).message);
    } finally {
      setUploading(false);
    }
  };

  const handleDeleteFile = async (file: GitHubFile) => {
    try {
      await deleteFile(
        repoConfig.owner,
        repoConfig.repo,
        file.path,
        file.sha,
        `Delete: ${file.name}`,
        repoConfig.branch
      );
      message.success(`已删除 ${file.name}`);
      setAllFiles((prev) => prev.filter((f) => f.sha !== file.sha));
    } catch (e) {
      message.error('删除失败: ' + (e as Error).message);
    }
  };

  const handleReplaceFile = (file: GitHubFile) => {
    setReplacingFile(file);
    replaceInputRef.current?.click();
  };

  const handleReplaceFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !replacingFile) return;

    setUploading(true);
    try {
      let arrayBuffer: ArrayBuffer;
      if (isImageFile(file.name)) {
        const compressed = await compressImageFile(file);
        arrayBuffer = await compressed.arrayBuffer();
      } else {
        arrayBuffer = await file.arrayBuffer();
      }

      await uploadImage(
        repoConfig.owner,
        repoConfig.repo,
        replacingFile.path,
        arrayBuffer,
        `Replace: ${replacingFile.name}`,
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
  const paginatedFiles = allFiles.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const renderFileCard = (file: GitHubFile) => {
    const isImage = isImageFile(file.name);
    const isJson = file.name.toLowerCase().endsWith('.json');

    return (
      <Col xs={12} sm={8} md={6} key={file.sha}>
        <Card
          hoverable
          size="small"
          cover={
            <div
              style={{
                height: 140,
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#fafafa',
                borderBottom: '1px solid #f0f0f0',
              }}
            >
              {isImage ? (
                <Image
                  src={getImageUrl(file)}
                  alt={file.name}
                  style={{ maxHeight: 140, maxWidth: '100%', objectFit: 'contain' }}
                  preview={true}
                  fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iIGZpbGw9IiNjY2MiIGZvbnQtc2l6ZT0iMTIiPuWKoOi9veWksei0pTwvdGV4dD48L3N2Zz4="
                />
              ) : (
                getFileIcon(file.name)
              )}
            </div>
          }
          actions={[
            ...(isJson
              ? [
                  <Button
                    type="text"
                    size="small"
                    icon={<EditOutlined />}
                    onClick={() => onSelectFile(file)}
                    key="edit"
                  >
                    编辑
                  </Button>,
                ]
              : []),
            <Button
              type="text"
              size="small"
              icon={<SwapOutlined />}
              onClick={() => handleReplaceFile(file)}
              key="replace"
            >
              替换
            </Button>,
            <Popconfirm
              title="确认删除"
              description={`确定要删除 "${file.name}" 吗？`}
              onConfirm={() => handleDeleteFile(file)}
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
              <Space direction="vertical" size={2} style={{ width: '100%' }}>
                <Text
                  ellipsis={{ tooltip: file.name }}
                  style={{ fontSize: 12, fontWeight: 500 }}
                >
                  {file.name}
                </Text>
                <Text type="secondary" style={{ fontSize: 11 }}>
                  {formatSize(file.size)}
                </Text>
              </Space>
            }
          />
        </Card>
      </Col>
    );
  };

  return (
    <Card
      title={
        <Space>
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} />
          <FileTextOutlined />
          <span>{repoConfig.label || `${repoConfig.owner}/${repoConfig.repo}`}</span>
          <Tag color="geekblue">{repoConfig.path}</Tag>
          <Tag>{allFiles.length} 个文件</Tag>
        </Space>
      }
      extra={
        <Space>
          <Upload
            multiple
            showUploadList={false}
            beforeUpload={(_file, fileList) => {
              const dataTransfer = new DataTransfer();
              fileList.forEach((f) => dataTransfer.items.add(f as unknown as File));
              handleUploadFiles(dataTransfer.files);
              return false;
            }}
            disabled={uploading}
          >
            <Button
              type="primary"
              icon={<UploadOutlined />}
              loading={uploading}
            >
              上传文件
            </Button>
          </Upload>
          <Button icon={<ReloadOutlined />} onClick={loadFiles} loading={loading}>
            刷新
          </Button>
        </Space>
      }
      style={{ borderRadius: 8 }}
    >
      {loading && allFiles.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">加载中...</Text>
          </div>
        </div>
      ) : allFiles.length === 0 ? (
        <Empty description="该目录下没有文件" />
      ) : (
        <>
          <Row gutter={[16, 16]}>
            {paginatedFiles.map((file) => renderFileCard(file))}
          </Row>

          {allFiles.length > PAGE_SIZE && (
            <div style={{ textAlign: 'center', marginTop: 24 }}>
              <Pagination
                current={currentPage}
                pageSize={PAGE_SIZE}
                total={allFiles.length}
                onChange={(page) => setCurrentPage(page)}
                showSizeChanger={false}
                showTotal={(total) => `共 ${total} 个文件`}
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
        onChange={handleReplaceFileSelected}
      />
    </Card>
  );
};

export default FileList;
