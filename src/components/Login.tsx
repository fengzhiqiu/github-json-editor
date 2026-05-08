import React, { useState } from 'react';
import { Card, Button, Input, Typography, Space, Divider, Alert, message } from 'antd';
import { GithubOutlined, KeyOutlined, LoginOutlined } from '@ant-design/icons';

const { Title, Text, Paragraph } = Typography;

interface LoginProps {
  onLoginWithToken: (token: string) => Promise<void>;
  onLoginWithOAuth: () => void;
  loading: boolean;
}

const Login: React.FC<LoginProps> = ({ onLoginWithToken, onLoginWithOAuth, loading }) => {
  const [token, setToken] = useState('');
  const [tokenLoading, setTokenLoading] = useState(false);

  const handleTokenLogin = async () => {
    if (!token.trim()) {
      message.warning('请输入 GitHub Token');
      return;
    }
    setTokenLoading(true);
    try {
      await onLoginWithToken(token.trim());
      message.success('登录成功！');
    } catch (e) {
      message.error('Token 无效，请检查后重试');
    } finally {
      setTokenLoading(false);
    }
  };

  const hasOAuthConfig = !!import.meta.env.VITE_GITHUB_CLIENT_ID;

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        padding: 16,
      }}
    >
      <Card
        style={{ maxWidth: 460, width: '100%', borderRadius: 12, boxShadow: '0 20px 60px rgba(0,0,0,0.3)' }}
        bodyStyle={{ padding: '40px 32px' }}
      >
        <Space direction="vertical" size="large" style={{ width: '100%', textAlign: 'center' }}>
          <GithubOutlined style={{ fontSize: 48, color: '#1677ff' }} />
          <Title level={3} style={{ margin: 0 }}>
            GitHub JSON Editor
          </Title>
          <Paragraph type="secondary">
            可视化编辑 GitHub 仓库中的 JSON 文件
          </Paragraph>
        </Space>

        <Divider />

        {hasOAuthConfig && (
          <>
            <Button
              type="primary"
              size="large"
              icon={<LoginOutlined />}
              block
              onClick={onLoginWithOAuth}
              loading={loading}
              style={{ height: 48, borderRadius: 8, marginBottom: 16 }}
            >
              使用 GitHub OAuth 登录
            </Button>
            <Divider plain>
              <Text type="secondary">或</Text>
            </Divider>
          </>
        )}

        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Text strong>
            <KeyOutlined /> 使用 Personal Access Token 登录
          </Text>
          <Input.Password
            size="large"
            placeholder="输入 GitHub Token (需要 repo 权限)"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            onPressEnter={handleTokenLogin}
            style={{ borderRadius: 8 }}
          />
          <Button
            type="default"
            size="large"
            block
            onClick={handleTokenLogin}
            loading={tokenLoading}
            style={{ height: 44, borderRadius: 8 }}
          >
            Token 登录
          </Button>
        </Space>

        <Alert
          message="如何获取 Token？"
          description="前往 GitHub → Settings → Developer settings → Personal access tokens → 创建 token（需勾选 repo 权限）"
          type="info"
          showIcon
          style={{ marginTop: 24, borderRadius: 8 }}
        />

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: '#999' }}>
          部署时间: {new Date(__BUILD_TIME__).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}
        </div>
      </Card>
    </div>
  );
};

declare const __BUILD_TIME__: string;

export default Login;
