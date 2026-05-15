import React, { useEffect, useState, useRef, useCallback } from 'react';
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
  Checkbox,
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
  CheckSquareOutlined,
  CloseSquareOutlined,
  PlayCircleOutlined,
  PauseCircleOutlined,
  SoundOutlined,
} from '@ant-design/icons';
import { RepoConfig, GitHubFile } from '../types';
import { useGitHub } from '../hooks/useGitHub';
import { isImageFile, getFileSha, getFileContent, updateFile } from '../utils/github';
import imageCompression from 'browser-image-compression';
import ScenePreview, { SceneData } from './ScenePreview';
import { EyeOutlined, LeftOutlined, RightOutlined } from '@ant-design/icons';

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
  const [previewingFile, setPreviewingFile] = useState<GitHubFile | null>(null);

  // Multi-select state
  const [selectMode, setSelectMode] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set()); // Set of file.sha
  const [batchDeleting, setBatchDeleting] = useState(false);

  // Audio player state
  const [playingAudioSha, setPlayingAudioSha] = useState<string>('');
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  const isAudioFile = (filename: string): boolean => {
    const ext = filename.toLowerCase().split('.').pop() || '';
    return ['mp3', 'wav', 'ogg', 'aac', 'm4a', 'flac', 'webm'].includes(ext);
  };

  const toggleAudioPlay = (file: GitHubFile) => {
    const fileUrl = getImageUrl(file); // same raw URL pattern works for audio
    if (playingAudioSha === file.sha) {
      // Stop playing
      audioPlayerRef.current?.pause();
      setPlayingAudioSha('');
    } else {
      // Start playing new audio
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
      const audio = new Audio(fileUrl);
      audio.onended = () => setPlayingAudioSha('');
      audio.onerror = () => {
        message.warning('音频加载失败');
        setPlayingAudioSha('');
      };
      audio.play();
      audioPlayerRef.current = audio;
      setPlayingAudioSha(file.sha);
    }
  };

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
      const hasSceneIndex = files.some((f) => f.name === 'scenes.json' || f.name === 'scenes-index.json');
      const isEnDataPath = currentFullPath.startsWith('en/data') || currentFullPath === 'en/data';
      setShowSceneButton((isCdnRepo && isEnDataPath) || hasSceneIndex);
    } catch (e) {
      message.error('加载文件列表失败: ' + (e as Error).message);
    }
  };

  useEffect(() => {
    loadFiles();
    setCurrentPage(1);
    // Stop audio when navigating to a different directory
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
      setPlayingAudioSha('');
    }
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
    if (isAudioFile(filename)) return <SoundOutlined style={{ fontSize: 48, color: '#722ed1' }} />;
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

  // Sorted list of scene files (numbered JSON) for prev/next navigation
  const sceneFiles = useMemo(() => {
    return allFiles
      .filter((f) => f.type !== 'dir' && /^\d+\.json$/.test(f.name))
      .sort((a, b) => parseInt(a.name) - parseInt(b.name));
  }, [allFiles]);

  const loadScenePreview = useCallback(async (file: GitHubFile) => {
    setPreviewLoading(true);
    setPreviewVisible(true);
    setPreviewSceneData(null);
    setPreviewingFile(file);
    try {
      const rawUrl = `https://raw.githubusercontent.com/${repoConfig.owner}/${repoConfig.repo}/${repoConfig.branch || 'main'}/${file.path}`;
      const res = await fetch(rawUrl);
      if (!res.ok) throw new Error(`加载失败: ${res.status}`);
      const data = await res.json();
      setPreviewSceneData(data);
    } catch (e: any) {
      message.error('加载场景数据失败: ' + e.message);
      setPreviewVisible(false);
      setPreviewingFile(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [repoConfig]);

  const handlePreviewScene = async (file: GitHubFile) => {
    await loadScenePreview(file);
  };

  // Keyboard navigation for scene preview (← / →)
  useEffect(() => {
    if (!previewVisible || !previewingFile || sceneFiles.length < 2) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (previewLoading) return;
      const currentIdx = sceneFiles.findIndex((f) => f.sha === previewingFile.sha);
      if (currentIdx === -1) return;

      let nextIdx = -1;
      if (e.key === 'ArrowLeft') {
        nextIdx = currentIdx > 0 ? currentIdx - 1 : sceneFiles.length - 1;
      } else if (e.key === 'ArrowRight') {
        nextIdx = currentIdx < sceneFiles.length - 1 ? currentIdx + 1 : 0;
      }

      if (nextIdx >= 0 && nextIdx !== currentIdx) {
        e.preventDefault();
        loadScenePreview(sceneFiles[nextIdx]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [previewVisible, previewingFile, previewLoading, sceneFiles, loadScenePreview]);

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

      // 2. Delete image (best effort — never block index update)
      try {
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
      } catch (imgErr) {
        console.warn(`删除图片失败（已忽略）:`, imgErr);
      }

      // 3. Delete audio (best effort — never block index update)
      try {
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
      } catch (audioErr) {
        console.warn(`删除音频失败（已忽略）:`, audioErr);
      }

      // 4. Update scenes.json — remove entry for this scene
      // Fetch fresh content AFTER deletes to get latest SHA
      const indexPath = 'en/data/scenes.json';
      const indexContent = await getFileContent(repoConfig.owner, repoConfig.repo, indexPath, branch);
      const indexData = JSON.parse(indexContent.content);
      const originalLength = indexData.scenes.length;
      // Use == for loose comparison in case id types mismatch (string vs number)
      indexData.scenes = indexData.scenes.filter((s: any) => Number(s.id) !== sceneId);

      if (indexData.scenes.length < originalLength) {
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
      } else {
        console.warn(`场景 ${sceneId} 不在 scenes.json 中，跳过更新`);
      }

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

  // Multi-select helpers
  const toggleSelect = (sha: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      if (next.has(sha)) {
        next.delete(sha);
      } else {
        next.add(sha);
      }
      return next;
    });
  };

  const selectAll = () => {
    const nonDirFiles = allFiles.filter((f) => f.type !== 'dir');
    setSelectedFiles(new Set(nonDirFiles.map((f) => f.sha)));
  };

  const deselectAll = () => {
    setSelectedFiles(new Set());
  };

  const exitSelectMode = () => {
    setSelectMode(false);
    setSelectedFiles(new Set());
  };

  const handleBatchDelete = async () => {
    const filesToDelete = allFiles.filter((f) => selectedFiles.has(f.sha) && f.type !== 'dir');
    if (filesToDelete.length === 0) return;

    setBatchDeleting(true);
    const hide = message.loading(`正在删除 ${filesToDelete.length} 个文件...`, 0);
    const branch = repoConfig.branch || 'main';

    let deleted = 0;
    const failed: string[] = [];
    // Track scene IDs to remove from index
    const deletedSceneIds: number[] = [];
    const isInScenesPath = currentFullPath.includes('scenes') || currentFullPath.includes('en/data');

    for (const file of filesToDelete) {
      try {
        // For scene files, also delete associated assets
        const sceneMatch = file.name.match(/^(\d+)\.json$/);
        if (sceneMatch && isInScenesPath) {
          const sceneId = parseInt(sceneMatch[1], 10);
          deletedSceneIds.push(sceneId);

          // Delete image (best effort)
          try {
            const imgPath = `en/img/scene-${sceneId}.webp`;
            const imgSha = await getFileSha(repoConfig.owner, repoConfig.repo, imgPath, branch);
            if (imgSha) {
              await deleteFile(repoConfig.owner, repoConfig.repo, imgPath, imgSha, `Batch delete scene ${sceneId}: image`, branch);
            }
          } catch { /* ignore */ }

          // Delete audio (best effort)
          try {
            const audioPath = `en/audio/scene-${sceneId}.mp3`;
            const audioSha = await getFileSha(repoConfig.owner, repoConfig.repo, audioPath, branch);
            if (audioSha) {
              await deleteFile(repoConfig.owner, repoConfig.repo, audioPath, audioSha, `Batch delete scene ${sceneId}: audio`, branch);
            }
          } catch { /* ignore */ }
        }

        // Get fresh SHA in case previous deletes changed it
        const freshSha = await getFileSha(repoConfig.owner, repoConfig.repo, file.path, branch);
        if (freshSha) {
          await deleteFile(repoConfig.owner, repoConfig.repo, file.path, freshSha, `Batch delete: ${file.name}`, branch);
        }
        deleted++;
      } catch (e: any) {
        failed.push(file.name);
        console.warn(`删除 ${file.name} 失败:`, e);
      }
    }

    // Update scenes.json if scene files were deleted
    if (deletedSceneIds.length > 0) {
      try {
        const indexPath = 'en/data/scenes.json';
        const indexContent = await getFileContent(repoConfig.owner, repoConfig.repo, indexPath, branch);
        const indexData = JSON.parse(indexContent.content);
        const sceneIdSet = new Set(deletedSceneIds);
        indexData.scenes = indexData.scenes.filter((s: any) => !sceneIdSet.has(Number(s.id)));
        const updatedIndex = JSON.stringify(indexData, null, 2) + '\n';
        await updateFile(repoConfig.owner, repoConfig.repo, indexPath, updatedIndex, indexContent.sha, `Batch delete: update index (removed ${deletedSceneIds.length} scenes)`, branch);
      } catch (e) {
        console.warn('更新 scenes.json 失败:', e);
      }
    }

    hide();
    setBatchDeleting(false);

    if (failed.length === 0) {
      message.success(`已删除 ${deleted} 个文件`);
    } else {
      message.warning(`删除完成：成功 ${deleted}，失败 ${failed.length}（${failed.slice(0, 3).join(', ')}${failed.length > 3 ? '...' : ''}）`);
    }

    // Update local list
    setAllFiles((prev) => prev.filter((f) => !selectedFiles.has(f.sha)));
    exitSelectMode();
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
    const isAudio = !isDir && isAudioFile(file.name);

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

    const isSceneFile = isInScenesDir && isJson && file.name !== 'scenes.json' && file.name !== 'scenes-index.json' && !!file.name.match(/^\d+\.json$/);

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

    return (
      <Col xs={12} sm={8} md={6} key={file.sha}>
        <Card
          hoverable
          size="small"
          styles={{ body: { padding: '8px 10px' } }}
          style={selectMode && selectedFiles.has(file.sha) ? { border: '2px solid #1677ff' } : undefined}
          onClick={selectMode ? (e) => { e.stopPropagation(); toggleSelect(file.sha); } : undefined}
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
                position: 'relative',
              }}
            >
              {selectMode && (
                <Checkbox
                  checked={selectedFiles.has(file.sha)}
                  onChange={() => toggleSelect(file.sha)}
                  onClick={(e) => e.stopPropagation()}
                  style={{ position: 'absolute', top: 8, left: 8, zIndex: 10 }}
                />
              )}
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
        >
          {/* File name + size */}
          <div style={{ marginBottom: 8 }}>
            <Text
              ellipsis={{ tooltip: file.name }}
              style={{ fontSize: 12, fontWeight: 500, display: 'block' }}
            >
              {file.name}
            </Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {formatSize(file.size)}
            </Text>
          </div>

          {/* Action buttons — stacked layout, full-width, mobile friendly */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {/* Row 1: primary actions */}
            <div style={{ display: 'flex', gap: 4 }}>
              {isSceneFile && (
                <Button
                  size="small"
                  icon={<EyeOutlined />}
                  onClick={() => handlePreviewScene(file)}
                  style={{ flex: 1, fontSize: 12 }}
                >
                  预览
                </Button>
              )}
              {(isSceneFile || isJson) && (
                <Button
                  size="small"
                  type="primary"
                  icon={<EditOutlined />}
                  onClick={() => onSelectFile(file, subPath)}
                  style={{ flex: 1, fontSize: 12 }}
                >
                  编辑
                </Button>
              )}
              {isAudio && (
                <Button
                  size="small"
                  type={playingAudioSha === file.sha ? 'primary' : 'default'}
                  icon={playingAudioSha === file.sha ? <PauseCircleOutlined /> : <PlayCircleOutlined />}
                  onClick={(e) => { e.stopPropagation(); toggleAudioPlay(file); }}
                  style={{ flex: 1, fontSize: 12 }}
                >
                  {playingAudioSha === file.sha ? '暂停' : '播放'}
                </Button>
              )}
              {/* For non-json/non-audio files (images etc), show only the ⋯ menu */}
              <Dropdown
                menu={{ items: moreItems }}
                trigger={['click']}
                placement="bottomRight"
              >
                <Button
                  size="small"
                  icon={<EllipsisOutlined />}
                  style={{ flexShrink: 0 }}
                />
              </Dropdown>
            </div>
          </div>
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
          {selectMode ? (
            <>
              <Tag color="blue">{selectedFiles.size} 项已选</Tag>
              <Button size="small" onClick={selectAll}>全选</Button>
              <Button size="small" onClick={deselectAll}>取消全选</Button>
              <Popconfirm
                title="批量删除"
                description={`确定要删除选中的 ${selectedFiles.size} 个文件吗？`}
                onConfirm={handleBatchDelete}
                okText="删除"
                cancelText="取消"
                okButtonProps={{ danger: true, loading: batchDeleting }}
                disabled={selectedFiles.size === 0}
              >
                <Button
                  danger
                  icon={<DeleteOutlined />}
                  disabled={selectedFiles.size === 0}
                  loading={batchDeleting}
                >
                  删除 ({selectedFiles.size})
                </Button>
              </Popconfirm>
              <Button icon={<CloseSquareOutlined />} onClick={exitSelectMode}>
                退出多选
              </Button>
            </>
          ) : (
            <>
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
                icon={<CheckSquareOutlined />}
                onClick={() => setSelectMode(true)}
              >
                多选
              </Button>
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
            </>
          )}
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
        title={
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingRight: 24 }}>
            <span>{previewSceneData ? `📱 场景预览 — ${previewSceneData.title}` : '加载中...'}</span>
            {sceneFiles.length > 1 && previewingFile && (
              <Space size={4} style={{ marginLeft: 16 }}>
                <Button
                  size="small"
                  icon={<LeftOutlined />}
                  disabled={previewLoading}
                  onClick={() => {
                    const idx = sceneFiles.findIndex((f) => f.sha === previewingFile.sha);
                    if (idx >= 0) loadScenePreview(sceneFiles[idx > 0 ? idx - 1 : sceneFiles.length - 1]);
                  }}
                />
                <Text type="secondary" style={{ fontSize: 12, minWidth: 48, textAlign: 'center', display: 'inline-block' }}>
                  {sceneFiles.findIndex((f) => f.sha === previewingFile.sha) + 1}/{sceneFiles.length}
                </Text>
                <Button
                  size="small"
                  icon={<RightOutlined />}
                  disabled={previewLoading}
                  onClick={() => {
                    const idx = sceneFiles.findIndex((f) => f.sha === previewingFile.sha);
                    if (idx >= 0) loadScenePreview(sceneFiles[idx < sceneFiles.length - 1 ? idx + 1 : 0]);
                  }}
                />
              </Space>
            )}
          </div>
        }
        open={previewVisible}
        onCancel={() => { setPreviewVisible(false); setPreviewingFile(null); }}
        footer={
          sceneFiles.length > 1 ? (
            <div style={{ textAlign: 'center' }}>
              <Text type="secondary" style={{ fontSize: 12 }}>💡 按 ← → 方向键快速切换场景</Text>
            </div>
          ) : null
        }
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
