import React, { useState } from 'react';
import { Layout, Typography, Avatar, Button, Space, Dropdown, ConfigProvider, theme } from 'antd';
import { GithubOutlined, LogoutOutlined, UserOutlined } from '@ant-design/icons';
import { useAuth } from './hooks/useAuth';
import Login from './components/Login';
import RepoSelector from './components/RepoSelector';
import FileList from './components/FileList';
import JsonEditor from './components/JsonEditor';
import { RepoConfig, GitHubFile } from './types';

const { Header, Content } = Layout;
const { Title } = Typography;

type View = 'repos' | 'files' | 'editor';

const App: React.FC = () => {
  const { token, user, loading, loginWithToken, loginWithOAuth, logout } = useAuth();
  const [currentView, setCurrentView] = useState<View>('repos');
  const [selectedRepo, setSelectedRepo] = useState<RepoConfig | null>(null);
  const [selectedFile, setSelectedFile] = useState<GitHubFile | null>(null);

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#f5f5f5',
      }}>
        <div style={{ textAlign: 'center' }}>
          <GithubOutlined style={{ fontSize: 48, color: '#1677ff' }} spin />
          <p style={{ marginTop: 16, color: '#666' }}>加载中...</p>
        </div>
      </div>
    );
  }

  if (!token || !user) {
    return (
      <Login
        onLoginWithToken={loginWithToken}
        onLoginWithOAuth={loginWithOAuth}
        loading={loading}
      />
    );
  }

  const handleSelectRepo = (config: RepoConfig) => {
    setSelectedRepo(config);
    setCurrentView('files');
  };

  const handleSelectFile = (file: GitHubFile) => {
    setSelectedFile(file);
    setCurrentView('editor');
  };

  const handleBackToRepos = () => {
    setSelectedRepo(null);
    setSelectedFile(null);
    setCurrentView('repos');
  };

  const handleBackToFiles = () => {
    setSelectedFile(null);
    setCurrentView('files');
  };

  const renderContent = () => {
    switch (currentView) {
      case 'repos':
        return <RepoSelector onSelect={handleSelectRepo} userLogin={user.login} />;
      case 'files':
        return selectedRepo ? (
          <FileList
            repoConfig={selectedRepo}
            onSelectFile={handleSelectFile}
            onBack={handleBackToRepos}
          />
        ) : null;
      case 'editor':
        return selectedRepo && selectedFile ? (
          <JsonEditor
            repoConfig={selectedRepo}
            file={selectedFile}
            onBack={handleBackToFiles}
          />
        ) : null;
      default:
        return null;
    }
  };

  return (
    <ConfigProvider
      theme={{
        algorithm: theme.defaultAlgorithm,
        token: {
          borderRadius: 8,
        },
      }}
    >
      <Layout style={{ minHeight: '100vh' }}>
        <Header
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0 24px',
            background: '#fff',
            borderBottom: '1px solid #f0f0f0',
            position: 'sticky',
            top: 0,
            zIndex: 100,
          }}
        >
          <Space
            style={{ cursor: 'pointer' }}
            onClick={handleBackToRepos}
          >
            <GithubOutlined style={{ fontSize: 24, color: '#1677ff' }} />
            <Title level={4} style={{ margin: 0, display: 'inline' }}>
              JSON Editor
            </Title>
          </Space>

          <Dropdown
            menu={{
              items: [
                {
                  key: 'user',
                  label: user.name || user.login,
                  icon: <UserOutlined />,
                  disabled: true,
                },
                { type: 'divider' },
                {
                  key: 'logout',
                  label: '退出登录',
                  icon: <LogoutOutlined />,
                  danger: true,
                  onClick: logout,
                },
              ],
            }}
          >
            <Space style={{ cursor: 'pointer' }}>
              <Avatar src={user.avatar_url} size="small" />
              <span style={{ fontSize: 14 }}>{user.login}</span>
            </Space>
          </Dropdown>
        </Header>

        <Content
          style={{
            padding: '24px',
            maxWidth: 1200,
            margin: '0 auto',
            width: '100%',
          }}
        >
          {renderContent()}
        </Content>
      </Layout>
    </ConfigProvider>
  );
};

export default App;
