import React, { useState } from 'react';
import { Upload, Button, Modal, message, Progress, Typography, Space, Input } from 'antd';
import { UploadOutlined, PictureOutlined } from '@ant-design/icons';
import type { UploadFile } from 'antd/es/upload/interface';
import { processImage } from '../utils/imageCompress';
import { uploadImage } from '../utils/github';
import { RepoConfig } from '../types';

const { Text } = Typography;

interface ImageUploaderProps {
  repoConfig: RepoConfig;
  onUploaded?: (url: string) => void;
}

const ImageUploader: React.FC<ImageUploaderProps> = ({ repoConfig, onUploaded }) => {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [imagePath, setImagePath] = useState('images');

  const handleUpload = async (file: File) => {
    setUploading(true);
    setProgress(10);

    try {
      // Step 1: Compress and convert to WebP
      setProgress(30);
      const { blob, name } = await processImage(file);
      setProgress(60);

      // Step 2: Upload to GitHub
      const arrayBuffer = await blob.arrayBuffer();
      const filePath = `${repoConfig.path}/${imagePath}/${name}`;
      const commitMessage = `Upload image: ${name}`;

      const result = await uploadImage(
        repoConfig.owner,
        repoConfig.repo,
        filePath,
        arrayBuffer,
        commitMessage,
        repoConfig.branch
      );

      setProgress(100);

      // Generate CDN URL
      const cdnUrl = `https://cdn.jsdelivr.net/gh/${repoConfig.owner}/${repoConfig.repo}@${repoConfig.branch}/${filePath}`;
      
      message.success(`图片上传成功！`);
      
      if (onUploaded) {
        onUploaded(cdnUrl);
      }

      Modal.success({
        title: '上传成功',
        content: (
          <div>
            <p>CDN 地址：</p>
            <Input.TextArea value={cdnUrl} autoSize readOnly />
          </div>
        ),
      });
    } catch (e) {
      message.error('上传失败: ' + (e as Error).message);
    } finally {
      setUploading(false);
      setProgress(0);
    }

    return false;
  };

  return (
    <div>
      <Space direction="vertical" style={{ width: '100%' }}>
        <Space>
          <Text>图片目录：</Text>
          <Input
            value={imagePath}
            onChange={(e) => setImagePath(e.target.value)}
            placeholder="images"
            style={{ width: 200 }}
          />
        </Space>
        
        <Upload
          accept="image/*"
          showUploadList={false}
          beforeUpload={(file) => {
            handleUpload(file);
            return false;
          }}
          disabled={uploading}
        >
          <Button
            icon={<PictureOutlined />}
            loading={uploading}
            type="dashed"
            size="large"
            style={{ width: '100%', height: 80, borderRadius: 8 }}
          >
            {uploading ? '处理中...' : '点击或拖拽上传图片（自动压缩转WebP）'}
          </Button>
        </Upload>

        {uploading && <Progress percent={progress} status="active" />}

        <Text type="secondary" style={{ fontSize: 12 }}>
          图片将自动压缩并转换为 WebP 格式，上传至 {repoConfig.owner}/{repoConfig.repo}/{repoConfig.path}/{imagePath}/
        </Text>
      </Space>
    </div>
  );
};

export default ImageUploader;
