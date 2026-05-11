import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  Button,
  Space,
  Typography,
  Tabs,
  message,
  Spin,
  Modal,
  Input,
  Form,
  Table,
  Collapse,
  Switch,
  InputNumber,
  Popconfirm,
  Tag,
  Tooltip,
} from 'antd';
import {
  ArrowLeftOutlined,
  SaveOutlined,
  PlusOutlined,
  DeleteOutlined,
  ArrowUpOutlined,
  ArrowDownOutlined,
  CodeOutlined,
  FormOutlined,
} from '@ant-design/icons';
import { RepoConfig, GitHubFile } from '../types';
import { useGitHub } from '../hooks/useGitHub';
import { inferSchema, validateJson } from '../utils/validator';
import RawEditor from './RawEditor';

const { Title, Text } = Typography;

interface JsonEditorProps {
  repoConfig: RepoConfig;
  file: GitHubFile;
  onBack: () => void;
}

const JsonEditor: React.FC<JsonEditorProps> = ({ repoConfig, file, onBack }) => {
  const [data, setData] = useState<any>(null);
  const [originalContent, setOriginalContent] = useState('');
  const [sha, setSha] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rawContent, setRawContent] = useState('');
  const [rawValid, setRawValid] = useState(true);
  const [activeTab, setActiveTab] = useState('visual');
  const [commitMessage, setCommitMessage] = useState('');
  const [schemaValidation, setSchemaValidation] = useState(true);

  const { fetchFileContent, saveFile } = useGitHub();

  useEffect(() => {
    loadFile();
  }, [file]);

  const loadFile = async () => {
    setLoading(true);
    try {
      const content = await fetchFileContent(
        repoConfig.owner,
        repoConfig.repo,
        file.path,
        repoConfig.branch
      );
      const parsed = JSON.parse(content.content);
      setData(parsed);
      setOriginalContent(content.content);
      setRawContent(JSON.stringify(parsed, null, 2));
      setSha(content.sha);
    } catch (e) {
      message.error('加载文件失败: ' + (e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    const contentToSave = activeTab === 'raw' ? rawContent : JSON.stringify(data, null, 2);

    if (activeTab === 'raw' && !rawValid) {
      message.error('JSON 格式错误，请修正后再保存');
      return;
    }

    // Validate against schema inferred from original data (when enabled)
    if (schemaValidation) {
      try {
        const dataToValidate = activeTab === 'raw' ? JSON.parse(rawContent) : data;
        const originalParsed = JSON.parse(originalContent);
        const schema = inferSchema(originalParsed);
        const { valid, errors } = validateJson(dataToValidate, schema);
        if (!valid) {
          Modal.error({
            title: 'Schema 校验失败',
            content: (
              <div>
                <p>数据结构不符合文件原始 Schema：</p>
                <ul style={{ maxHeight: 200, overflow: 'auto' }}>
                  {errors.slice(0, 10).map((err, i) => (
                    <li key={i} style={{ color: '#f5222d', fontSize: 12 }}>{err}</li>
                  ))}
                </ul>
              </div>
            ),
          });
          return;
        }
      } catch {}
    }

    const defaultMessage = `Update ${file.name}`;
    const finalMessage = commitMessage || defaultMessage;

    setSaving(true);
    try {
      const result = await saveFile(
        repoConfig.owner,
        repoConfig.repo,
        file.path,
        contentToSave,
        sha,
        finalMessage,
        repoConfig.branch
      );
      setSha(result.sha);
      setOriginalContent(contentToSave);
      message.success('保存成功！已提交到 GitHub');
      setCommitMessage('');
    } catch (e) {
      message.error('保存失败: ' + (e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const handleRawChange = (value: string, valid: boolean) => {
    setRawContent(value);
    setRawValid(valid);
    if (valid) {
      try {
        setData(JSON.parse(value));
      } catch {}
    }
  };

  const handleDataChange = (newData: any) => {
    setData(newData);
    setRawContent(JSON.stringify(newData, null, 2));
  };

  const hasChanges = () => {
    const current = activeTab === 'raw' ? rawContent : JSON.stringify(data, null, 2);
    return current !== originalContent && current !== JSON.stringify(JSON.parse(originalContent), null, 2);
  };

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">加载文件内容...</Text>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Card
        title={
          <Space>
            <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} />
            <Text strong>{file.name}</Text>
            {hasChanges() && <Tag color="orange">未保存</Tag>}
          </Space>
        }
        extra={
          <Space>
            <Tooltip title="开启后保存时自动校验数据结构是否符合原始 Schema">
              <Space size={4}>
                <Switch
                  size="small"
                  checked={schemaValidation}
                  onChange={setSchemaValidation}
                />
                <Text type="secondary" style={{ fontSize: 12 }}>
                  Schema 校验
                </Text>
              </Space>
            </Tooltip>
            <Input
              placeholder="Commit message (可选)"
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
              style={{ width: 200 }}
            />
            <Button
              type="primary"
              icon={<SaveOutlined />}
              onClick={handleSave}
              loading={saving}
            >
              保存到 GitHub
            </Button>
          </Space>
        }
        style={{ borderRadius: 8 }}
      >
        <Tabs
          activeKey={activeTab}
          onChange={(key) => setActiveTab(key)}
          items={[
            {
              key: 'visual',
              label: (
                <Space>
                  <FormOutlined />
                  可视化编辑
                </Space>
              ),
              children: (
                <VisualEditor data={data} onChange={handleDataChange} schemaValidation={schemaValidation} />
              ),
            },
            {
              key: 'raw',
              label: (
                <Space>
                  <CodeOutlined />
                  JSON 源码
                </Space>
              ),
              children: (
                <RawEditor
                  value={rawContent}
                  onChange={handleRawChange}
                  height="600px"
                />
              ),
            },

          ]}
        />
      </Card>
    </div>
  );
};

// VisualEditor sub-component
interface VisualEditorProps {
  data: any;
  onChange: (data: any) => void;
  schemaValidation?: boolean;
}

const VisualEditor: React.FC<VisualEditorProps> = ({ data, onChange, schemaValidation = true }) => {
  if (data === null || data === undefined) {
    return <Text type="secondary">文件内容为空</Text>;
  }

  if (Array.isArray(data)) {
    return <ArrayEditor data={data} onChange={onChange} schemaValidation={schemaValidation} />;
  }

  if (typeof data === 'object') {
    return <ObjectEditor data={data} onChange={onChange} path="" />;
  }

  return (
    <Input
      value={String(data)}
      onChange={(e) => {
        const val = e.target.value;
        // Try to parse as number or boolean
        if (val === 'true') onChange(true);
        else if (val === 'false') onChange(false);
        else if (!isNaN(Number(val)) && val !== '') onChange(Number(val));
        else onChange(val);
      }}
    />
  );
};

// ArrayEditor - shows array as table
interface ArrayEditorProps {
  data: any[];
  onChange: (data: any[]) => void;
  schemaValidation?: boolean;
}

const ArrayEditor: React.FC<ArrayEditorProps> = ({ data, onChange, schemaValidation = true }) => {
  const [editingItem, setEditingItem] = useState<{ index: number; data: any } | null>(null);
  const [addRawMode, setAddRawMode] = useState(false);
  const [addRawText, setAddRawText] = useState('');
  const [addRawErrors, setAddRawErrors] = useState<string[]>([]);
  const [autoIncrementId, setAutoIncrementId] = useState(false);

  // Detect if items have an "id" field with numeric values
  const hasIdField = data.length > 0 &&
    typeof data[0] === 'object' && !Array.isArray(data[0]) &&
    'id' in data[0] && typeof data[0].id === 'number';

  const getNextId = (): number => {
    const maxId = data.reduce((max: number, item: any) => {
      const id = typeof item?.id === 'number' ? item.id : 0;
      return id > max ? id : max;
    }, 0);
    return maxId + 1;
  };

  if (data.length === 0) {
    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <Text type="secondary">空数组</Text>
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() => {
            onChange([{}]);
          }}
        >
          添加第一项
        </Button>
      </Space>
    );
  }

  // If array items are objects, show as table
  if (typeof data[0] === 'object' && !Array.isArray(data[0])) {
    const allKeys = Array.from(
      new Set(data.flatMap((item) => Object.keys(item || {})))
    );

    const columns = [
      {
        title: '#',
        key: 'index',
        width: 50,
        render: (_: any, __: any, index: number) => index + 1,
      },
      ...allKeys.slice(0, 6).map((key) => ({
        title: key,
        dataIndex: key,
        key,
        ellipsis: true,
        render: (value: any) => {
          if (value === null || value === undefined) return <Text type="secondary">-</Text>;
          if (typeof value === 'boolean') return <Tag color={value ? 'green' : 'red'}>{String(value)}</Tag>;
          if (typeof value === 'object') return <Tag>Object</Tag>;
          const str = String(value);
          if (str.length > 50) return <Tooltip title={str}>{str.slice(0, 50)}...</Tooltip>;
          return str;
        },
      })),
      {
        title: '操作',
        key: 'actions',
        width: 160,
        render: (_: any, __: any, index: number) => (
          <Space size="small">
            <Button
              type="link"
              size="small"
              onClick={() => setEditingItem({ index, data: { ...data[index] } })}
            >
              编辑
            </Button>
            <Button
              type="link"
              size="small"
              icon={<ArrowUpOutlined />}
              disabled={index === 0}
              onClick={() => {
                const newData = [...data];
                [newData[index - 1], newData[index]] = [newData[index], newData[index - 1]];
                onChange(newData);
              }}
            />
            <Button
              type="link"
              size="small"
              icon={<ArrowDownOutlined />}
              disabled={index === data.length - 1}
              onClick={() => {
                const newData = [...data];
                [newData[index], newData[index + 1]] = [newData[index + 1], newData[index]];
                onChange(newData);
              }}
            />
            <Popconfirm
              title="确定删除此项？"
              onConfirm={() => {
                const newData = data.filter((_, i) => i !== index);
                onChange(newData);
              }}
            >
              <Button type="link" size="small" danger icon={<DeleteOutlined />} />
            </Popconfirm>
          </Space>
        ),
      },
    ];

    return (
      <Space direction="vertical" style={{ width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Space>
            <Text strong>共 {data.length} 项</Text>
            {hasIdField && (
              <Tooltip title="新增时自动将 id 设为当前最大值 +1">
                <Space size={4}>
                  <Switch
                    size="small"
                    checked={autoIncrementId}
                    onChange={setAutoIncrementId}
                  />
                  <Text type="secondary" style={{ fontSize: 12 }}>ID 自增</Text>
                </Space>
              </Tooltip>
            )}
          </Space>
          <Button
            type="primary"
            size="small"
            icon={<PlusOutlined />}
            onClick={() => {
              // Create a new item with same keys as first item
              const template: any = {};
              allKeys.forEach((key) => {
                const sampleValue = data[0]?.[key];
                if (typeof sampleValue === 'string') template[key] = '';
                else if (typeof sampleValue === 'number') template[key] = 0;
                else if (typeof sampleValue === 'boolean') template[key] = false;
                else if (Array.isArray(sampleValue)) template[key] = [];
                else if (typeof sampleValue === 'object') template[key] = {};
                else template[key] = '';
              });
              setEditingItem({ index: data.length, data: template });
            }}
          >
            新增
          </Button>
        </div>

        <Table
          dataSource={data.map((item, index) => ({ ...item, _key: index }))}
          columns={columns}
          rowKey="_key"
          size="small"
          scroll={{ x: true }}
          pagination={data.length > 10 ? { pageSize: 10 } : false}
        />

        <Modal
          title={editingItem && editingItem.index < data.length ? `编辑第 ${editingItem.index + 1} 项` : '新增项'}
          open={!!editingItem}
          onOk={() => {
            if (!editingItem) return;

            // Determine the data to save
            let itemData = editingItem.data;
            if (addRawMode) {
              try {
                itemData = JSON.parse(addRawText);
              } catch (e) {
                setAddRawErrors([`JSON 格式错误: ${(e as Error).message}`]);
                return;
              }
            }

            // Validate against inferred schema from existing items (when enabled)
            if (schemaValidation && data.length > 0) {
              const itemSchema = inferSchema(data[0]);
              const { valid, errors } = validateJson(itemData, itemSchema);
              if (!valid) {
                setAddRawErrors(errors);
                message.error('数据不符合当前数组的 Schema');
                return;
              }
            }

            // Auto-increment id for new items
            if (autoIncrementId && editingItem.index >= data.length && typeof itemData === 'object' && itemData !== null) {
              itemData = { ...itemData, id: getNextId() };
            }

            // Save
            if (editingItem.index < data.length) {
              const newData = [...data];
              newData[editingItem.index] = itemData;
              onChange(newData);
            } else {
              onChange([...data, itemData]);
            }
            setEditingItem(null);
            setAddRawMode(false);
            setAddRawText('');
            setAddRawErrors([]);
          }}
          onCancel={() => {
            setEditingItem(null);
            setAddRawMode(false);
            setAddRawText('');
            setAddRawErrors([]);
          }}
          width={640}
          destroyOnClose
        >
          {editingItem && (
            <Space direction="vertical" style={{ width: '100%' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}>
                <Button
                  size="small"
                  type={addRawMode ? 'primary' : 'default'}
                  icon={<CodeOutlined />}
                  onClick={() => {
                    if (!addRawMode) {
                      // Switch to raw: serialize current data
                      setAddRawText(JSON.stringify(editingItem.data, null, 2));
                    } else {
                      // Switch to form: parse raw text
                      try {
                        const parsed = JSON.parse(addRawText);
                        setEditingItem({ ...editingItem, data: parsed });
                      } catch {}
                    }
                    setAddRawMode(!addRawMode);
                    setAddRawErrors([]);
                  }}
                >
                  {addRawMode ? '表单模式' : 'JSON 模式'}
                </Button>
              </div>

              {addRawMode ? (
                <Input.TextArea
                  value={addRawText}
                  onChange={(e) => {
                    setAddRawText(e.target.value);
                    setAddRawErrors([]);
                  }}
                  autoSize={{ minRows: 8, maxRows: 20 }}
                  placeholder='粘贴 JSON 对象，例如: {"name": "xxx", "value": 123}'
                  style={{ fontFamily: 'monospace', fontSize: 13 }}
                />
              ) : (
                <ObjectEditor
                  data={editingItem.data}
                  onChange={(newData) => setEditingItem({ ...editingItem, data: newData })}
                  path=""
                />
              )}

              {addRawErrors.length > 0 && (
                <div style={{ marginTop: 8 }}>
                  {addRawErrors.map((err, i) => (
                    <Text key={i} type="danger" style={{ display: 'block', fontSize: 12 }}>
                      ❌ {err}
                    </Text>
                  ))}
                </div>
              )}
            </Space>
          )}
        </Modal>
      </Space>
    );
  }

  // Simple array (strings, numbers)
  return (
    <Space direction="vertical" style={{ width: '100%' }}>
      {data.map((item, index) => (
        <Space key={index} style={{ width: '100%' }}>
          <Tag>{index + 1}</Tag>
          <Input
            value={String(item)}
            onChange={(e) => {
              const newData = [...data];
              newData[index] = e.target.value;
              onChange(newData);
            }}
            style={{ flex: 1 }}
          />
          <Popconfirm
            title="确定删除？"
            onConfirm={() => onChange(data.filter((_, i) => i !== index))}
          >
            <Button danger size="small" icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ))}
      <Button
        type="dashed"
        icon={<PlusOutlined />}
        onClick={() => onChange([...data, ''])}
        block
      >
        添加
      </Button>
    </Space>
  );
};

// ObjectEditor - renders object fields as form
interface ObjectEditorProps {
  data: Record<string, any>;
  onChange: (data: Record<string, any>) => void;
  path: string;
}

const ObjectEditor: React.FC<ObjectEditorProps> = ({ data, onChange, path }) => {
  const [newFieldName, setNewFieldName] = useState('');
  const [showAddField, setShowAddField] = useState(false);

  const handleFieldChange = (key: string, value: any) => {
    onChange({ ...data, [key]: value });
  };

  const handleDeleteField = (key: string) => {
    const newData = { ...data };
    delete newData[key];
    onChange(newData);
  };

  const handleAddField = () => {
    if (newFieldName && !(newFieldName in data)) {
      onChange({ ...data, [newFieldName]: '' });
      setNewFieldName('');
      setShowAddField(false);
    }
  };

  const renderField = (key: string, value: any) => {
    if (value === null || value === undefined) {
      return (
        <Input
          value=""
          placeholder="null"
          onChange={(e) => handleFieldChange(key, e.target.value || null)}
        />
      );
    }

    if (typeof value === 'boolean') {
      return (
        <Switch
          checked={value}
          onChange={(checked) => handleFieldChange(key, checked)}
          checkedChildren="true"
          unCheckedChildren="false"
        />
      );
    }

    if (typeof value === 'number') {
      return (
        <InputNumber
          value={value}
          onChange={(v) => handleFieldChange(key, v ?? 0)}
          style={{ width: '100%' }}
        />
      );
    }

    if (Array.isArray(value)) {
      return (
        <Collapse
          size="small"
          items={[
            {
              key: `${path}.${key}`,
              label: <Text type="secondary">Array [{value.length} items]</Text>,
              children: (
                <ArrayEditor
                  data={value}
                  onChange={(newArr) => handleFieldChange(key, newArr)}
                />
              ),
            },
          ]}
        />
      );
    }

    if (typeof value === 'object') {
      return (
        <Collapse
          size="small"
          items={[
            {
              key: `${path}.${key}`,
              label: <Text type="secondary">Object {`{${Object.keys(value).length} fields}`}</Text>,
              children: (
                <ObjectEditor
                  data={value}
                  onChange={(newObj) => handleFieldChange(key, newObj)}
                  path={`${path}.${key}`}
                />
              ),
            },
          ]}
        />
      );
    }

    // String - use TextArea for long text
    const strValue = String(value);
    if (strValue.length > 100) {
      return (
        <Input.TextArea
          value={strValue}
          onChange={(e) => handleFieldChange(key, e.target.value)}
          autoSize={{ minRows: 2, maxRows: 6 }}
        />
      );
    }

    return (
      <Input
        value={strValue}
        onChange={(e) => handleFieldChange(key, e.target.value)}
      />
    );
  };

  return (
    <div style={{ width: '100%' }}>
      <Form layout="vertical" size="small">
        {Object.entries(data).map(([key, value]) => (
          <Form.Item
            key={key}
            label={
              <Space>
                <Text strong>{key}</Text>
                <Tag style={{ fontSize: 10 }}>
                  {Array.isArray(value) ? 'array' : typeof value}
                </Tag>
                <Popconfirm
                  title={`确定删除字段 "${key}"？`}
                  onConfirm={() => handleDeleteField(key)}
                >
                  <Button type="text" size="small" danger icon={<DeleteOutlined />} />
                </Popconfirm>
              </Space>
            }
            style={{ marginBottom: 12 }}
          >
            {renderField(key, value)}
          </Form.Item>
        ))}
      </Form>

      {showAddField ? (
        <Space style={{ marginTop: 8 }}>
          <Input
            placeholder="字段名"
            value={newFieldName}
            onChange={(e) => setNewFieldName(e.target.value)}
            onPressEnter={handleAddField}
            autoFocus
          />
          <Button type="primary" size="small" onClick={handleAddField}>
            确定
          </Button>
          <Button size="small" onClick={() => setShowAddField(false)}>
            取消
          </Button>
        </Space>
      ) : (
        <Button
          type="dashed"
          icon={<PlusOutlined />}
          onClick={() => setShowAddField(true)}
          size="small"
          style={{ marginTop: 8 }}
        >
          添加字段
        </Button>
      )}
    </div>
  );
};

export default JsonEditor;
