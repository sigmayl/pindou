import { useRef, useState } from "react";
import type { SourceImage } from "../lib/image";
import { CloseIcon, UploadIcon } from "./Icons";

interface Props {
  source: SourceImage | null;
  disabled: boolean;
  onFile: (file: File) => void;
  onClear: () => void;
}

export function UploadCard({ source, disabled, onFile, onClear }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const pick = (files: FileList | null) => {
    const file = files?.[0];
    if (file) onFile(file);
  };

  return (
    <div className="upload-card">
      <div className="step-heading">
        <span className="step-index">1</span>
        <div>
          <h2>上传图片</h2>
          <p>支持 PNG、JPEG、WebP，最大 20 MB。</p>
        </div>
      </div>

      {source ? (
        <div className="source-preview">
          <img src={source.previewUrl} alt="已上传的源图" />
          <div className="source-meta">
            <span title="原图尺寸 → 浏览器工作尺寸">
              原图 {source.originalWidth} × {source.originalHeight}
              {(source.width !== source.originalWidth || source.height !== source.originalHeight) && (
                <small className="working-size"> · 工作 {source.width} × {source.height}</small>
              )}
            </span>
            <button
              type="button"
              className="icon-button"
              onClick={onClear}
              aria-label="移除图片"
            >
              <CloseIcon width={16} height={16} />
            </button>
          </div>
          <button
            type="button"
            className="ghost-button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
          >
            更换图片
          </button>
        </div>
      ) : (
        <button
          type="button"
          className={`dropzone ${dragging ? "is-dragging" : ""}`}
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            pick(event.dataTransfer.files);
          }}
        >
          <span className="dropzone-icon">
            <UploadIcon width={26} height={26} />
          </span>
          <strong>拖入图片，或点击选择</strong>
          <span className="muted">建议使用主体清晰、背景简单的图片</span>
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/bmp"
        hidden
        onChange={(event) => {
          pick(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}
