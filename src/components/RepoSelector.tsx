import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Card,
  Button,
  Modal,
  Form,
  Input,
  List,
  Space,
  Tag,
  Popconfirm,
  message,
  Typography,
  Spin,
  Empty,
  Tabs,
  Tree,
  Tooltip,
  Divider,
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  FolderOutlined,
  FileTextOutlined,
  SearchOutlined,
  LockOutlined,
  GlobalOutlined,
  ClockCircleOutlined,
  CheckOutlined,
  LoadingOutlined,
  ReloadOutlined,
} from '@ant-design/icons';
import type { DataNode } from 'antd/es/tree';
import { RepoConfig, GitHubRepo, GitHubContentItem } from '../types';
import { getRecentRepos, addRecentRepo, removeRecentRepo, getLegacyRepos } from '../config/repos';
import { listUserRepos, listContents } from '../utils/github';

const { Text, Title } = Typography;
const { Search } = Input;

interface RepoSelectorProps {
  onSelect: (config: RepoConfig) => void;
  userLogin: string;
}

const RepoSelector: React.FC<RepoSelectorProps> = ({ onSelect, userLogin }) => {
  // Recent repos
  const [recentRepos, setRecentRepos] = useState<RepoConfig[]>([]);

  // My repos
  const [repos, setRepos] = useState<GitHubRepo[]>([]);
  const [reposLoading, setReposLoading] = useState(false);
  const [reposPage, setReposPage] = useState(1);
  const [hasMoreRepos, setHasMoreRepos] = useState(true);
  const [searchText, setSearchText] = useState('');

  // Directory browsing
  const [browsingRepo, setBrowsingRepo] = useState<GitHubRepo | null>(null);
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [treeLoading, setTreeLoading] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<React.Key[]>([]);
  const [dirContents, setDirContents] = useState<Map<string, GitHubContentItem[]>>(new Map());

  // Manual add modal
  const [modalVisible, setModalVisible] = useState(false);
  const [form] = Form.useForm();

  const loadingMoreRef = useRef(false);

  // Load recent repos on mount
  useEffect(() => {
    const recent = getRecentRepos(userLogin);
    // Also migrate legacy repos if any
    if (recent.length === 0) {
      const legacy = getLegacyRepos();
      if (legacy.length > 0) {
        legacy.forEach((r) => addRecentRepo(userLogin, r));
        setRecentRepos(legacy);
      }
    } else {
      setRecentRepos(recent);
    }
  }, [userLogin]);

  // Load repos on mount
  useEffect(() => {
    loadRepos(1, true);
  }, []);

  const loadRepos = async (page: number, reset: boolean = false) => {
    if (loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setReposLoading(true);
    try {
      const { repos: newRepos, hasMore } = await listUserRepos(page, 30);
      if (reset) {
        setRepos(newRepos);
      } else {
        setRepos((prev) => [...prev, ...newRepos]);
      }
      setReposPage(page);
      setHasMoreRepos(hasMore);
    } catch (e) {
      message.error('加载仓库列表失败: ' + (e as Error).message);
    } finally {
      setReposLoading(false);
      loadingMoreRef.current = false;
    }
  };

  const handleLoadMore = () => {
    if (hasMoreRepos && !reposLoading) {
      loadRepos(reposPage + 1);
    }
  };

  // Filter repos by search text
  const filteredRepos = searchText
    ? repos.filter(
        (r) =>
          r.name.toLowerCase().includes(searchText.toLowerCase()) ||
          r.full_name.toLowerCase().includes(searchText.toLowerCase()) ||
          (r.description && r.description.toLowerCase().includes(searchText.toLowerCase()))
      )
    : repos;

  // Handle clicking a repo to browse its directories
  const handleBrowseRepo = async (repo: GitHubRepo) => {
    setBrowsingRepo(repo);
    setTreeData([]);
    setExpandedKeys([]);
    setDirContents(new Map());
    setTreeLoading(true);
    try {
      const contents = await listContents(repo.owner.login, repo.name, '', repo.default_branch);
      const newDirContents = new Map<string, GitHubContentItem[]>();
      newDirContents.set('', contents);
      setDirContents(newDirContents);
      setTreeData(buildTreeData(contents, ''));
    } catch (e) {
      const errMsg = (e as Error).message;
      if (errMsg.includes('empty repository') || errMsg.includes('404')) {
        message.warning('该仓库为空或无法访问');
      } else {
        message.error('加载目录失败: ' + errMsg);
      }
      setTreeData([]);
    } finally {
      setTreeLoading(false);
    }
  };

  const buildTreeData = (contents: GitHubContentItem[], parentPath: string): DataNode[] => {
    const dirs = contents.filter((c) => c.type === 'dir');
    const files = contents.filter((c) => c.type === 'file');

    const nodes: DataNode[] = [];

    // Add directories
    dirs.forEach((dir) => {
      nodes.push({
        title: (
          <Space>
            <FolderOutlined style={{ color: '#faad14' }} />
            <span>{dir.name}</span>
          </Space>
        ),
        key: dir.path,
        isLeaf: false,
      });
    });

    // Add files as leaves (not selectable, just for display)
    files.forEach((file) => {
      nodes.push({
        title: (
          <Space>
            <FileTextOutlined style={{ color: '#1677ff' }} />
            <Text type="secondary">{file.name}</Text>
          </Space>
        ),
        key: `file:${file.path}`,
        isLeaf: true,
        selectable: false,
      });
    });

    return nodes;
  };

  // Lazy load directory contents on expand
  const onLoadData = async (treeNode: any): Promise<void> => {
    const { key } = treeNode;
    const path = key as string;

    if (dirContents.has(path)) return;

    if (!browsingRepo) return;

    try {
      const contents = await listContents(
        browsingRepo.owner.login,
        browsingRepo.name,
        path,
        browsingRepo.default_branch
      );
      const newDirContents = new Map(dirContents);
      newDirContents.set(path, contents);
      setDirContents(newDirContents);

      // Update tree data by finding and updating the node
      setTreeData((prev) => updateTreeNode(prev, path, buildTreeData(contents, path)));
    } catch (e) {
      message.error('加载目录内容失败');
    }
  };

  const updateTreeNode = (nodes: DataNode[], targetKey: string, children: DataNode[]): DataNode[] => {
    return nodes.map((node) => {
      if (node.key === targetKey) {
        return { ...node, children };
      }
      if (node.children) {
        return { ...node, children: updateTreeNode(node.children, targetKey, children) };
      }
      return node;
    });
  };

  // Check if a directory path has any files
  const dirHasFiles = (path: string): boolean => {
    const contents = dirContents.get(path);
    if (!contents) return false;
    return contents.some((c) => c.type === 'file');
  };

  // Handle selecting a directory to use
  const handleSelectDirectory = (dirPath: string) => {
    if (!browsingRepo) return;

    const config: RepoConfig = {
      id: `${browsingRepo.owner.login}/${browsingRepo.name}/${dirPath}/${Date.now()}`,
      owner: browsingRepo.owner.login,
      repo: browsingRepo.name,
      branch: browsingRepo.default_branch,
      path: dirPath,
      label: `${browsingRepo.name}/${dirPath || '(root)'}`,
    };

    // Add to recent
    addRecentRepo(userLogin, config);
    setRecentRepos(getRecentRepos(userLogin));

    onSelect(config);
  };

  // Handle selecting root directory
  const handleSelectRoot = () => {
    if (!browsingRepo) return;
    const rootContents = dirContents.get('');
    if (rootContents && rootContents.some((c) => c.type === 'file')) {
      handleSelectDirectory('');
    } else {
      message.warning('根目录下没有文件');
    }
  };

  // Handle selecting recent repo
  const handleSelectRecent = (config: RepoConfig) => {
    // Move to top of recent
    addRecentRepo(userLogin, config);
    setRecentRepos(getRecentRepos(userLogin));
    onSelect(config);
  };

  const handleDeleteRecent = (id: string) => {
    removeRecentRepo(userLogin, id);
    setRecentRepos(getRecentRepos(userLogin));
    message.success('已删除');
  };

  // Manual add
  const handleManualAdd = () => {
    form.resetFields();
    form.setFieldsValue({ branch: 'main' });
    setModalVisible(true);
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      const config: RepoConfig = {
        ...values,
        id: Date.now().toString(),
        label: values.label || `${values.owner}/${values.repo}/${values.path}`,
      };

      // Add to recent
      addRecentRepo(userLogin, config);
      setRecentRepos(getRecentRepos(userLogin));

      setModalVisible(false);
      onSelect(config);
    } catch {
      // validation failed
    }
  };

  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (diffDays < 7) return `${diffDays}天前`;
    if (diffDays < 30) return `${Math.floor(diffDays / 7)}周前`;
    if (diffDays < 365) return `${Math.floor(diffDays / 30)}个月前`;
    return `${Math.floor(diffDays / 365)}年前`;
  };

  // Render directory browser view
  if (browsingRepo) {
    return (
      <Card
        title={
          <Space>
            <Button type="text" onClick={() => setBrowsingRepo(null)}>
              ← 返回
            </Button>
            <FolderOpenOutlined />
            <span>{browsingRepo.full_name}</span>
            <Tag color="blue">{browsingRepo.default_branch}</Tag>
          </Space>
        }
        style={{ borderRadius: 8 }}
      >
        {treeLoading ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">加载目录结构...</Text>
            </div>
          </div>
        ) : treeData.length === 0 ? (
          <Empty description="仓库为空或没有内容" />
        ) : (
          <>
            <div style={{ marginBottom: 16 }}>
              <Text type="secondary">
                点击展开目录，找到目标目录后点击"选择此目录"
              </Text>
            </div>

            {/* Root directory select button */}
            {dirHasFiles('') && (
              <div style={{ marginBottom: 16 }}>
                <Button
                  type="primary"
                  icon={<CheckOutlined />}
                  onClick={handleSelectRoot}
                  size="small"
                >
                  选择根目录（含 {dirContents.get('')?.filter((c) => c.type === 'file').length} 个文件）
                </Button>
              </div>
            )}

            <Tree
              treeData={treeData}
              loadData={onLoadData}
              expandedKeys={expandedKeys}
              onExpand={(keys) => setExpandedKeys(keys)}
              showLine={{ showLeafIcon: false }}
              titleRender={(node) => {
                const nodeKey = node.key as string;
                const titleContent = typeof node.title === 'function' ? null : node.title;
                // Don't show button for file nodes
                if (nodeKey.startsWith('file:')) {
                  return <>{titleContent}</>;
                }
                const hasFiles = dirHasFiles(nodeKey);
                return (
                  <Space>
                    {titleContent}
                    {hasFiles && (
                      <Button
                        type="primary"
                        size="small"
                        icon={<CheckOutlined />}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectDirectory(nodeKey);
                        }}
                      >
                        选择此目录（{dirContents.get(nodeKey)?.filter((c) => c.type === 'file').length} 个文件）
                      </Button>
                    )}
                  </Space>
                );
              }}
            />
          </>
        )}
      </Card>
    );
  }

  // Main view with tabs
  return (
    <div>
      {/* Recent repos section */}
      {recentRepos.length > 0 && (
        <Card
          title={
            <Space>
              <ClockCircleOutlined />
              <span>最近使用</span>
            </Space>
          }
          style={{ borderRadius: 8, marginBottom: 16 }}
          size="small"
        >
          <List
            dataSource={recentRepos}
            size="small"
            renderItem={(repo) => (
              <List.Item
                actions={[
                  <Popconfirm
                    title="从最近使用中移除？"
                    onConfirm={() => handleDeleteRecent(repo.id)}
                    key="delete"
                  >
                    <Button type="link" size="small" danger icon={<DeleteOutlined />} />
                  </Popconfirm>,
                ]}
                style={{ cursor: 'pointer' }}
                onClick={() => handleSelectRecent(repo)}
              >
                <List.Item.Meta
                  title={
                    <Space size="small">
                      <Text strong style={{ fontSize: 13 }}>
                        {repo.label || `${repo.owner}/${repo.repo}`}
                      </Text>
                      <Tag color="blue" style={{ fontSize: 11 }}>
                        {repo.branch}
                      </Tag>
                    </Space>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      {repo.owner}/{repo.repo}/{repo.path}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />
        </Card>
      )}

      {/* My repos section */}
      <Card
        title={
          <Space>
            <FolderOpenOutlined />
            <span>我的仓库</span>
          </Space>
        }
        extra={
          <Space>
            <Button
              icon={<ReloadOutlined />}
              size="small"
              onClick={() => loadRepos(1, true)}
              loading={reposLoading && repos.length === 0}
            >
              刷新
            </Button>
          </Space>
        }
        style={{ borderRadius: 8, marginBottom: 16 }}
      >
        <Search
          placeholder="搜索仓库名或描述..."
          prefix={<SearchOutlined />}
          allowClear
          value={searchText}
          onChange={(e) => setSearchText(e.target.value)}
          style={{ marginBottom: 16 }}
        />

        {reposLoading && repos.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 40 }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">加载仓库列表...</Text>
            </div>
          </div>
        ) : filteredRepos.length === 0 ? (
          <Empty
            description={searchText ? '没有匹配的仓库' : '没有找到仓库'}
          />
        ) : (
          <>
            <List
              dataSource={filteredRepos}
              renderItem={(repo) => (
                <List.Item
                  style={{ cursor: 'pointer', padding: '12px 0' }}
                  onClick={() => handleBrowseRepo(repo)}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <Text strong>{repo.full_name}</Text>
                        {repo.private ? (
                          <Tooltip title="私有仓库">
                            <LockOutlined style={{ color: '#faad14' }} />
                          </Tooltip>
                        ) : (
                          <Tooltip title="公开仓库">
                            <GlobalOutlined style={{ color: '#52c41a' }} />
                          </Tooltip>
                        )}
                        {repo.language && (
                          <Tag style={{ fontSize: 11 }}>{repo.language}</Tag>
                        )}
                      </Space>
                    }
                    description={
                      <Space direction="vertical" size={2} style={{ width: '100%' }}>
                        {repo.description && (
                          <Text type="secondary" style={{ fontSize: 12 }} ellipsis>
                            {repo.description}
                          </Text>
                        )}
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          <ClockCircleOutlined style={{ marginRight: 4 }} />
                          更新于 {formatTime(repo.updated_at)}
                        </Text>
                      </Space>
                    }
                  />
                </List.Item>
              )}
            />
            {hasMoreRepos && !searchText && (
              <div style={{ textAlign: 'center', marginTop: 16 }}>
                <Button onClick={handleLoadMore} loading={reposLoading}>
                  {reposLoading ? '加载中...' : '加载更多'}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>

      {/* Manual add section */}
      <Card
        size="small"
        style={{ borderRadius: 8 }}
      >
        <div style={{ textAlign: 'center' }}>
          <Button type="dashed" icon={<PlusOutlined />} onClick={handleManualAdd}>
            手动添加仓库（适用于他人的公开仓库）
          </Button>
        </div>
      </Card>

      {/* Manual add modal */}
      <Modal
        title="手动添加仓库"
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item name="label" label="标签（可选）">
            <Input placeholder="例如：CKD 管理 - 数据" />
          </Form.Item>
          <Form.Item
            name="owner"
            label="仓库所有者"
            rules={[{ required: true, message: '请输入仓库所有者' }]}
          >
            <Input placeholder="例如：fengzhiqiu" />
          </Form.Item>
          <Form.Item
            name="repo"
            label="仓库名"
            rules={[{ required: true, message: '请输入仓库名' }]}
          >
            <Input placeholder="例如：minigrogram-ckd-manage" />
          </Form.Item>
          <Form.Item
            name="branch"
            label="分支"
            rules={[{ required: true, message: '请输入分支名' }]}
          >
            <Input placeholder="main" />
          </Form.Item>
          <Form.Item
            name="path"
            label="目录路径"
            rules={[{ required: true, message: '请输入目录路径' }]}
          >
            <Input placeholder="例如：data" />
          </Form.Item>
        </Form>
      </Modal>
    </div>
  );
};

export default RepoSelector;
