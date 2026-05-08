import React, { useEffect, useState } from 'react';
import { Card, List, Button, Typography, Space, Tag, Spin, Empty, message } from 'antd';
import {
  FileTextOutlined,
  ReloadOutlined,
  ArrowLeftOutlined,
  CloudDownloadOutlined,
} from '@ant-design/icons';
import { RepoConfig, GitHubFile } from '../types';
import { useGitHub } from '../hooks/useGitHub';

const { Text } = Typography;

interface FileListProps {
  repoConfig: RepoConfig;
  onSelectFile: (file: GitHubFile) => void;
  onBack: () => void;
}

const FileList: React.FC<FileListProps> = ({ repoConfig, onSelectFile, onBack }) => {
  const [files, setFiles] = useState<GitHubFile[]>([]);
  const { loading, fetchFiles } = useGitHub();

  const loadFiles = async () => {
    try {
      const result = await fetchFiles(repoConfig);
      setFiles(result);
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

  return (
    <Card
      title={
        <Space>
          <Button
            type="text"
            icon={<ArrowLeftOutlined />}
            onClick={onBack}
          />
          <FileTextOutlined />
          <span>
            {repoConfig.label || `${repoConfig.owner}/${repoConfig.repo}`}
          </span>
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
      {loading && files.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">加载中...</Text>
          </div>
        </div>
      ) : files.length === 0 ? (
        <Empty description="该目录下没有 JSON 文件" />
      ) : (
        <List
          dataSource={files}
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
    </Card>
  );
};

export default FileList;
