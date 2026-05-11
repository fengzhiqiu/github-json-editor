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
  Input,
  Breadcrumb,
  Dropdown,
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
  FolderOutlined,
  FolderAddOutlined,
  HomeFilled,
  EllipsisOutlined,
} from '@ant-design/icons';
import { RepoConfig, GitHubFile } from '../types';
import { useGitHub } from '../hooks/useGitHub';
import { isImageFile, getFileSha, getFileContent, updateFile } from '../utils/github';
import imageCompression from 'browser-image-compression';
import ScenePreview, { SceneData } from './ScenePreview';
import { EyeOutlined } from '@ant-design/icons';

const { Text } = Typography;

interface FileListProps {
  repoConfig: RepoConfig;
  onSelectFile: (file: GitHubFile, subPath?: string) => void;
  onBack: () => void;
  onOpenSceneEditor?: () => void;
  onOpenDifyGenerator?: () => void;
  initialSubPath?: string;
  onSubPathChange?: (subPath: string) => void;
}

const PAGE_SIZE = 20;

const FileList: React.FC<FileListProps> = ({ repoConfig, onSelectFile, onBack, onOpenSceneEditor, onOpenDifyGenerator, initialSubPath, onSubPathChange }) => {
  const [allFiles, setAllFiles] = useState<GitHubFile[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState('');
  const [subPath, setSubPathInternal] = useState(initialSubPath || ''); // relative path from repoConfig.path

  // Wrap setSubPath to notify parent
  const setSubPath = (path: string) => {
    setSubPathInternal(path);
    onSubPathChange?.(path);
  };
  const [createDirVisible, setCreateDirVisible] = useState(false);
  const [newDirName, setNewDirName] = useState('');
  const [creatingDir, setCreatingDir] = useState(false);
  const [renameVisible, setRenameVisible] = useState(false);
  const [renamingFile, setRenamingFile] = useState<GitHubFile | null>(null);
  const [newFileName, setNewFileName] = useState('');
  const [renaming, setRenaming] = useState(false);
  const { loading, fetchAllFiles, uploadImage, deleteFile, createDirectory, renameFile } = useGitHub();
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [replacingFile, setReplacingFile] = useState<GitHubFile | null>(null);

  const [refreshKey, setRefreshKey] = useState(0);
  const [showSceneButton, setShowSceneButton] = useState(false);

  // Scene preview modal state
  const [previewVisible, setPreviewVisible] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewSceneData, setPreviewSceneData] = useState<SceneData | null>(null);

  // Compute the full current path
  const currentFullPath = subPath
    ? `${repoConfig.path.replace(/\/+$/, '')}/${subPath}`
    : repoConfig.path;

  const loadFiles = async () => {
    try {
      const files = await fetchAllFiles({
        ...repoConfig,
        path: currentFullPath,
      } as RepoConfig);
      setAllFiles(files);

      // Detect CDN scene structure
      const isCdnRepo = repoConfig.owner === 'techinsblog' && repoConfig.repo === 'cdn';
      const hasSceneIndex = files.some((f) => f.name === 'scenes-index.json');
      const isEnDataPath = currentFullPath.startsWith('en/data') || currentFullPath === 'en/data';
      setShowSceneButton((isCdnRepo && isEnDataPath) || hasSceneIndex);
    } catch (e) {
      message.error('加载文件列表失败: ' + (e as Error).message);
    }
  };

  useEffect(() => {
    loadFiles();
    setCurrentPage(1);
  }, [repoConfig, refreshKey, subPath]);

  const reloadAfterChange = async () => {
    await loadFiles();
    setTimeout(() => setRefreshKey((k) => k + 1), 2000);
  };

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
    if (lower.endsWith('.json')) return <FileTextOutlined style={{ fontSize: 48, color: '#1677ff' }} />;
    if (lower.endsWith('.md')) return <FileMarkdownOutlined style={{ fontSize: 48, color: '#52c41a' }} />;
    if (lower.endsWith('.pdf')) return <FilePdfOutlined style={{ fontSize: 48, color: '#f5222d' }} />;
    return <FileOutlined style={{ fontSize: 48, color: '#999' }} />;
  };

  const sanitizeFilename = (name: string): string => {
    const lastDot = name.lastIndexOf('.');
    const ext = lastDot >= 0 ? name.slice(lastDot) : '';
    const base = lastDot >= 0 ? name.slice(0, lastDot) : name;
    const hasUnsafe = /[^\w.\-]/.test(base);
    if (hasUnsafe) {
      const cleanBase = base.replace(/[^\w]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      const suffix = Date.now().toString(36);
      return (cleanBase || 'file') + '-' + suffix + ext;
    }
    return name;
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
      return file;
    }
  };

  const handleUploadFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;

    const existingNames = new Set(allFiles.map((f) => f.name));
    const newFiles: { file: File; uploadName: string }[] = [];
    const skippedNames: string[] = [];
    const usedNames = new Set<string>();
    for (let i = 0; i < fileList.length; i++) {
      const uploadName = sanitizeFilename(fileList[i].name);
      if (existingNames.has(uploadName) || existingNames.has(fileList[i].name) || usedNames.has(uploadName)) {
        skippedNames.push(fileList[i].name);
      } else {
        newFiles.push({ file: fileList[i], uploadName });
        usedNames.add(uploadName);
      }
    }

    if (skippedNames.length > 0) {
      message.info(`已跳过 ${skippedNames.length} 个重复文件：${skippedNames.slice(0, 3).join(', ')}${skippedNames.length > 3 ? '...' : ''}`);
    }

    if (newFiles.length === 0) {
      message.warning('所有文件都已存在，无需上传');
      return;
    }

    setUploading(true);
    setUploadProgress(`0/${newFiles.length}`);

    try {
      const basePath = currentFullPath.replace(/^\/+/, '');
      let uploaded = 0;
      const total = newFiles.length;

      for (const { file, uploadName } of newFiles) {
        setUploadProgress(`${uploaded + 1}/${total} ${uploadName}`);

        let arrayBuffer: ArrayBuffer;
        if (isImageFile(file.name)) {
          const compressed = await compressImageFile(file);
          arrayBuffer = await compressed.arrayBuffer();
        } else {
          arrayBuffer = await file.arrayBuffer();
        }

        const filePath = basePath ? `${basePath}/${uploadName}` : uploadName;

        await uploadImage(
          repoConfig.owner,
          repoConfig.repo,
          filePath,
          arrayBuffer,
          `Upload: ${uploadName}`,
          repoConfig.branch
        );
        uploaded++;

        // Queue interval: wait for GitHub to process the commit before next upload
        // Longer wait for more files to avoid compounding conflicts
        if (uploaded < total) {
          const waitMs = total > 5 ? 1500 : 1000;
          setUploadProgress(`${uploaded}/${total} ✓ 等待队列...`);
          await new Promise((r) => setTimeout(r, waitMs));
        }
      }
      message.success(`上传完成（${total} 个文件）`);
      await reloadAfterChange();
    } catch (e) {
      message.error('上传失败: ' + (e as Error).message);
    } finally {
      setUploading(false);
      setUploadProgress('');
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
      await reloadAfterChange();
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

  // Navigate into a directory
  const handleEnterDir = (dir: GitHubFile) => {
    const relativePath = subPath ? `${subPath}/${dir.name}` : dir.name;
    setSubPath(relativePath);
  };

  // Navigate via breadcrumb
  const handleBreadcrumbClick = (pathIndex: number) => {
    if (pathIndex < 0) {
      setSubPath('');
    } else {
      const parts = subPath.split('/');
      setSubPath(parts.slice(0, pathIndex + 1).join('/'));
    }
  };

  // Create directory
  const handleCreateDir = async () => {
    const trimmed = newDirName.trim();
    if (!trimmed) {
      message.warning('目录名不能为空');
      return;
    }
    if (/[\/\\:*?"<>|]/.test(trimmed)) {
      message.warning('目录名包含非法字符');
      return;
    }
    // Check if already exists
    if (allFiles.some((f) => f.name === trimmed)) {
      message.warning(`"${trimmed}" 已存在`);
      return;
    }

    setCreatingDir(true);
    try {
      const basePath = currentFullPath.replace(/^\/+/, '');
      const dirPath = basePath ? `${basePath}/${trimmed}` : trimmed;
      await createDirectory(
        repoConfig.owner,
        repoConfig.repo,
        dirPath,
        `Create directory: ${trimmed}`,
        repoConfig.branch
      );
      message.success(`目录 "${trimmed}" 创建成功`);
      setCreateDirVisible(false);
      setNewDirName('');
      await reloadAfterChange();
    } catch (e) {
      message.error('创建目录失败: ' + (e as Error).message);
    } finally {
      setCreatingDir(false);
    }
  };

  // Rename file
  const handleOpenRename = (file: GitHubFile) => {
    setRenamingFile(file);
    setNewFileName(file.name);
    setRenameVisible(true);
  };

  const handleRenameFile = async () => {
    const trimmed = newFileName.trim();
    if (!trimmed || !renamingFile) return;
    if (trimmed === renamingFile.name) {
      setRenameVisible(false);
      return;
    }
    if (/[\/\\:*?"<>|]/.test(trimmed)) {
      message.warning('文件名包含非法字符');
      return;
    }
    if (allFiles.some((f) => f.name === trimmed && f.path !== renamingFile.path)) {
      message.warning(`"${trimmed}" 已存在`);
      return;
    }

    setRenaming(true);
    try {
      // Build new path
      const dirPath = renamingFile.path.substring(0, renamingFile.path.lastIndexOf('/'));
      const newPath = dirPath ? `${dirPath}/${trimmed}` : trimmed;

      await renameFile(
        repoConfig.owner,
        repoConfig.repo,
        renamingFile.path,
        newPath,
        `Rename: ${renamingFile.name} → ${trimmed}`,
        repoConfig.branch
      );
      message.success(`已重命名为 ${trimmed}`);
      setRenameVisible(false);
      setRenamingFile(null);
      setNewFileName('');
      await reloadAfterChange();
    } catch (e) {
      message.error('重命名失败: ' + (e as Error).message);
    } finally {
      setRenaming(false);
    }
  };

  // Check if we're in a scenes directory (for preview button)
  const isInScenesDir = currentFullPath.includes('scenes') || subPath.includes('scenes');

  const handlePreviewScene = async (file: GitHubFile) => {
    setPreviewLoading(true);
    setPreviewVisible(true);
    setPreviewSceneData(null);
    try {
      // Load from GitHub raw URL for immediate access
      const rawUrl = `https://raw.githubusercontent.com/${repoConfig.owner}/${repoConfig.repo}/${repoConfig.branch || 'main'}/${file.path}`;
      const res = await fetch(rawUrl);
      if (!res.ok) throw new Error(`加载失败: ${res.status}`);
      const data = await res.json();
      setPreviewSceneData(data);
    } catch (e: any) {
      message.error('加载场景数据失败: ' + e.message);
      setPreviewVisible(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const [deletingScene, setDeletingScene] = useState(false);

  const handleDeleteScene = async (file: GitHubFile) => {
    // Extract scene ID from filename (e.g. "12.json" → 12)
    const match = file.name.match(/^(\d+)\.json$/);
    if (!match) {
      // Not a numbered scene file, fall back to normal delete
      await handleDeleteFile(file);
      return;
    }
    const sceneId = parseInt(match[1], 10);
    const branch = repoConfig.branch || 'main';

    setDeletingScene(true);
    const hide = message.loading(`正在删除场景 ${sceneId} 及关联资源...`, 0);

    try {
      // 1. Delete the JSON file
      await deleteFile(
        repoConfig.owner,
        repoConfig.repo,
        file.path,
        file.sha,
        `Delete scene ${sceneId}: remove JSON`,
        branch
      );

      // 2. Delete image (best effort)
      const imgPath = `en/img/scene-${sceneId}.webp`;
      const imgSha = await getFileSha(repoConfig.owner, repoConfig.repo, imgPath, branch);
      if (imgSha) {
        await deleteFile(
          repoConfig.owner,
          repoConfig.repo,
          imgPath,
          imgSha,
          `Delete scene ${sceneId}: remove image`,
          branch
        );
      }

      // 3. Delete audio (best effort)
      const audioPath = `en/audio/scene-${sceneId}.mp3`;
      const audioSha = await getFileSha(repoConfig.owner, repoConfig.repo, audioPath, branch);
      if (audioSha) {
        await deleteFile(
          repoConfig.owner,
          repoConfig.repo,
          audioPath,
          audioSha,
          `Delete scene ${sceneId}: remove audio`,
          branch
        );
      }

      // 4. Update scenes-index.json — remove entry for this scene
      const indexPath = 'en/data/scenes-index.json';
      const indexContent = await getFileContent(repoConfig.owner, repoConfig.repo, indexPath, branch);
      const indexData = JSON.parse(indexContent.content);
      indexData.scenes = indexData.scenes.filter((s: any) => s.id !== sceneId);
      const updatedIndex = JSON.stringify(indexData, null, 2) + '\n';

      await updateFile(
        repoConfig.owner,
        repoConfig.repo,
        indexPath,
        updatedIndex,
        indexContent.sha,
        `Delete scene ${sceneId}: update index`,
        branch
      );

      message.success(`场景 ${sceneId} 已完全删除（JSON + 图片 + 音频 + 索引）`);
      // Remove from local list
      setAllFiles((prev) => prev.filter((f) => f.sha !== file.sha));
    } catch (e: any) {
      message.error('删除场景失败: ' + e.message);
    } finally {
      hide();
      setDeletingScene(false);
    }
  };

  // Breadcrumb segments
  const pathSegments = subPath ? subPath.split('/') : [];

  // Pagination
  const paginatedFiles = allFiles.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE
  );

  const renderFileCard = (file: GitHubFile) => {
    const isDir = file.type === 'dir';
    const isImage = !isDir && isImageFile(file.name);
    const isJson = !isDir && file.name.toLowerCase().endsWith('.json');

    if (isDir) {
      return (
        <Col xs={12} sm={8} md={6} key={file.path}>
          <Card
            hoverable
            size="small"
            onClick={() => handleEnterDir(file)}
            cover={
              <div
                style={{
                  height: 160,
                  overflow: 'hidden',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: '#f6f8fa',
                  borderBottom: '1px solid #f0f0f0',
                  cursor: 'pointer',
                }}
              >
                <FolderOutlined style={{ fontSize: 56, color: '#faad14' }} />
              </div>
            }
          >
            <Card.Meta
              description={
                <Text
                  ellipsis={{ tooltip: file.name }}
                  style={{ fontSize: 12, fontWeight: 500 }}
                >
                  📁 {file.name}
                </Text>
              }
            />
          </Card>
        </Col>
      );
    }

    return (
      <Col xs={12} sm={8} md={6} key={file.sha}>
        <Card
          hoverable
          size="small"
          cover={
            <div
              style={{
                height: 160,
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
                  style={{ maxHeight: 160, maxWidth: '100%', objectFit: 'contain' }}
                  preview={true}
                  fallback="data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMTAwIiBoZWlnaHQ9IjEwMCIgZmlsbD0iI2YwZjBmMCIvPjx0ZXh0IHg9IjUwIiB5PSI1MCIgdGV4dC1hbmNob3I9Im1pZGRsZSIgZHk9Ii4zZW0iIGZpbGw9IiNjY2MiIGZvbnQtc2l6ZT0iMTIiPuWKoOi9veWksei0pTwvdGV4dD48L3N2Zz4="
                />
              ) : (
                getFileIcon(file.name)
              )}
            </div>
          }
          actions={(() => {
            const isSceneFile = isInScenesDir && isJson && file.name !== 'scenes-index.json' && !!file.name.match(/^\d+\.json$/);

            // "More" dropdown items
            const moreItems = [
              {
                key: 'rename',
                icon: <EditOutlined style={{ color: '#722ed1' }} />,
                label: <span style={{ color: '#722ed1' }}>改名</span>,
                onClick: () => handleOpenRename(file),
              },
              {
                key: 'replace',
                icon: <SwapOutlined />,
                label: '替换',
                onClick: () => handleReplaceFile(file),
              },
              { type: 'divider' as const },
              ...(isSceneFile
                ? [{
                    key: 'delete-scene',
                    icon: <DeleteOutlined style={{ color: '#ff4d4f' }} />,
                    label: (
                      <Popconfirm
                        title="删除整个场景"
                        description="将同步删除 JSON、图片、音频，并从索引中移除"
                        onConfirm={() => handleDeleteScene(file)}
                        okText="删除场景"
                        cancelText="取消"
                        okButtonProps={{ danger: true, loading: deletingScene }}
                        // stop dropdown from closing before confirm
                        onPopupClick={(e) => e.stopPropagation()}
                      >
                        <span style={{ color: '#ff4d4f' }}>删除场景</span>
                      </Popconfirm>
                    ),
                  }]
                : [{
                    key: 'delete',
                    icon: <DeleteOutlined style={{ color: '#ff4d4f' }} />,
                    label: (
                      <Popconfirm
                        title="确认删除"
                        description={`确定要删除 "${file.name}" 吗？`}
                        onConfirm={() => handleDeleteFile(file)}
                        okText="删除"
                        cancelText="取消"
                        okButtonProps={{ danger: true }}
                        onPopupClick={(e) => e.stopPropagation()}
                      >
                        <span style={{ color: '#ff4d4f' }}>删除</span>
                      </Popconfirm>
                    ),
                  }]
              ),
            ];

            return [
              // Primary actions (scene: 预览 + 编辑; image: nothing; others: 编辑)
              ...(isSceneFile
                ? [
                    <Button
                      type="text"
                      icon={<EyeOutlined />}
                      onClick={() => handlePreviewScene(file)}
                      key="preview"
                      style={{ color: '#1677ff' }}
                    >
                      预览
                    </Button>,
                    <Button
                      type="text"
                      icon={<EditOutlined />}
                      onClick={() => onSelectFile(file, subPath)}
                      key="edit"
                    >
                      编辑
                    </Button>,
                  ]
                : isJson
                  ? [
                      <Button
                        type="text"
                        icon={<EditOutlined />}
                        onClick={() => onSelectFile(file, subPath)}
                        key="edit"
                      >
                        编辑
                      </Button>,
                    ]
                  : []
              ),
              // "More" button
              <Dropdown
                key="more"
                menu={{ items: moreItems }}
                trigger={['click']}
                placement="bottomRight"
              >
                <Button type="text" icon={<EllipsisOutlined />} />
              </Dropdown>,
            ];
          })()}
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
          <Tag color="geekblue">{currentFullPath}</Tag>
          <Tag>{allFiles.length} 项</Tag>
        </Space>
      }
      extra={
        <Space wrap>
          {showSceneButton && onOpenSceneEditor && (
            <Button
              type="primary"
              style={{ background: '#722ed1', borderColor: '#722ed1' }}
              onClick={onOpenSceneEditor}
            >
              ✨ 新增场景
            </Button>
          )}
          {showSceneButton && onOpenDifyGenerator && (
            <Button
              type="primary"
              onClick={onOpenDifyGenerator}
            >
              🚀 AI 生成
            </Button>
          )}
          <Button
            icon={<FolderAddOutlined />}
            onClick={() => setCreateDirVisible(true)}
          >
            创建目录
          </Button>
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
              {uploading && uploadProgress ? uploadProgress : '上传文件'}
            </Button>
          </Upload>
          <Button icon={<ReloadOutlined />} onClick={loadFiles} loading={loading}>
            刷新
          </Button>
        </Space>
      }
      style={{ borderRadius: 8 }}
    >
      {/* Breadcrumb navigation */}
      {pathSegments.length > 0 && (
        <Breadcrumb style={{ marginBottom: 16 }}>
          <Breadcrumb.Item>
            <a onClick={() => handleBreadcrumbClick(-1)}>
              <HomeFilled /> {repoConfig.path.split('/').pop() || 'root'}
            </a>
          </Breadcrumb.Item>
          {pathSegments.map((seg, idx) => (
            <Breadcrumb.Item key={idx}>
              {idx === pathSegments.length - 1 ? (
                <span>{seg}</span>
              ) : (
                <a onClick={() => handleBreadcrumbClick(idx)}>{seg}</a>
              )}
            </Breadcrumb.Item>
          ))}
        </Breadcrumb>
      )}

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
                showTotal={(total) => `共 ${total} 项`}
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

      {/* Create directory modal */}
      <Modal
        title="创建目录"
        open={createDirVisible}
        onOk={handleCreateDir}
        onCancel={() => { setCreateDirVisible(false); setNewDirName(''); }}
        confirmLoading={creatingDir}
        okText="创建"
        cancelText="取消"
      >
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary">在当前目录下创建新目录：{currentFullPath}/</Text>
        </div>
        <Input
          placeholder="输入目录名称"
          value={newDirName}
          onChange={(e) => setNewDirName(e.target.value)}
          onPressEnter={handleCreateDir}
          autoFocus
        />
      </Modal>

      {/* Rename file modal */}
      <Modal
        title="重命名文件"
        open={renameVisible}
        onOk={handleRenameFile}
        onCancel={() => { setRenameVisible(false); setRenamingFile(null); setNewFileName(''); }}
        confirmLoading={renaming}
        okText="确认"
        cancelText="取消"
      >
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary">
            当前文件：{renamingFile?.name}
          </Text>
        </div>
        <Input
          placeholder="输入新文件名"
          value={newFileName}
          onChange={(e) => setNewFileName(e.target.value)}
          onPressEnter={handleRenameFile}
          autoFocus
        />
      </Modal>

      {/* Scene Preview Modal */}
      <Modal
        title={previewSceneData ? `📱 场景预览 — ${previewSceneData.title}` : '加载中...'}
        open={previewVisible}
        onCancel={() => setPreviewVisible(false)}
        footer={null}
        width={480}
        centered
        destroyOnClose
      >
        {previewLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 12, color: '#999' }}>加载场景数据...</div>
          </div>
        ) : previewSceneData ? (
          <ScenePreview sceneData={previewSceneData} />
        ) : null}
      </Modal>
    </Card>
  );
};

export default FileList;
