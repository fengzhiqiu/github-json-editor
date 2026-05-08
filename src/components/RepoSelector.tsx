import React, { useState, useEffect } from 'react';
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
} from 'antd';
import {
  PlusOutlined,
  DeleteOutlined,
  FolderOpenOutlined,
  EditOutlined,
} from '@ant-design/icons';
import { RepoConfig } from '../types';
import { getRepos, saveRepos } from '../config/repos';

const { Text } = Typography;

interface RepoSelectorProps {
  onSelect: (config: RepoConfig) => void;
}

const RepoSelector: React.FC<RepoSelectorProps> = ({ onSelect }) => {
  const [repos, setRepos] = useState<RepoConfig[]>([]);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingRepo, setEditingRepo] = useState<RepoConfig | null>(null);
  const [form] = Form.useForm();

  useEffect(() => {
    setRepos(getRepos());
  }, []);

  const handleAdd = () => {
    setEditingRepo(null);
    form.resetFields();
    form.setFieldsValue({ branch: 'main' });
    setModalVisible(true);
  };

  const handleEdit = (repo: RepoConfig) => {
    setEditingRepo(repo);
    form.setFieldsValue(repo);
    setModalVisible(true);
  };

  const handleDelete = (id: string) => {
    const newRepos = repos.filter((r) => r.id !== id);
    setRepos(newRepos);
    saveRepos(newRepos);
    message.success('已删除');
  };

  const handleModalOk = async () => {
    try {
      const values = await form.validateFields();
      let newRepos: RepoConfig[];

      if (editingRepo) {
        newRepos = repos.map((r) =>
          r.id === editingRepo.id ? { ...values, id: editingRepo.id } : r
        );
      } else {
        const newRepo: RepoConfig = {
          ...values,
          id: Date.now().toString(),
        };
        newRepos = [...repos, newRepo];
      }

      setRepos(newRepos);
      saveRepos(newRepos);
      setModalVisible(false);
      message.success(editingRepo ? '已更新' : '已添加');
    } catch {
      // validation failed
    }
  };

  return (
    <Card
      title={
        <Space>
          <FolderOpenOutlined />
          <span>仓库配置</span>
        </Space>
      }
      extra={
        <Button type="primary" icon={<PlusOutlined />} onClick={handleAdd}>
          添加仓库
        </Button>
      }
      style={{ borderRadius: 8 }}
    >
      <List
        dataSource={repos}
        locale={{ emptyText: '暂无仓库配置，请点击右上角添加' }}
        renderItem={(repo) => (
          <List.Item
            actions={[
              <Button
                type="link"
                icon={<EditOutlined />}
                onClick={() => handleEdit(repo)}
                key="edit"
              />,
              <Popconfirm
                title="确定删除？"
                onConfirm={() => handleDelete(repo.id)}
                key="delete"
              >
                <Button type="link" danger icon={<DeleteOutlined />} />
              </Popconfirm>,
            ]}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect(repo)}
          >
            <List.Item.Meta
              title={
                <Space>
                  <Text strong>{repo.label || `${repo.owner}/${repo.repo}`}</Text>
                  <Tag color="blue">{repo.branch}</Tag>
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

      <Modal
        title={editingRepo ? '编辑仓库配置' : '添加仓库配置'}
        open={modalVisible}
        onOk={handleModalOk}
        onCancel={() => setModalVisible(false)}
        destroyOnClose
      >
        <Form form={form} layout="vertical" style={{ marginTop: 16 }}>
          <Form.Item
            name="label"
            label="标签（可选）"
          >
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
    </Card>
  );
};

export default RepoSelector;
