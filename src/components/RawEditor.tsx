import React, { useState, useEffect } from 'react';
import { Alert } from 'antd';
import Editor from '@monaco-editor/react';
import { parseJsonSafe } from '../utils/validator';

interface RawEditorProps {
  value: string;
  onChange: (value: string, valid: boolean) => void;
  height?: string;
}

const RawEditor: React.FC<RawEditorProps> = ({ value, onChange, height = '500px' }) => {
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const { error: parseError } = parseJsonSafe(value);
    setError(parseError);
  }, []);

  const handleChange = (newValue: string | undefined) => {
    if (newValue === undefined) return;
    const { error: parseError } = parseJsonSafe(newValue);
    setError(parseError);
    onChange(newValue, !parseError);
  };

  return (
    <div>
      {error && (
        <Alert
          message="JSON 格式错误"
          description={error}
          type="error"
          showIcon
          style={{ marginBottom: 12, borderRadius: 8 }}
        />
      )}
      <div style={{ border: '1px solid #d9d9d9', borderRadius: 8, overflow: 'hidden' }}>
        <Editor
          height={height}
          defaultLanguage="json"
          value={value}
          onChange={handleChange}
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            wordWrap: 'on',
            formatOnPaste: true,
            formatOnType: true,
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 2,
          }}
          theme="vs-dark"
        />
      </div>
    </div>
  );
};

export default RawEditor;
