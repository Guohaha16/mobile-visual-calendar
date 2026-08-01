import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ImagePlus, Send, X } from "lucide-react";

import { FrostedIconButton } from "../../components/FrostedIconButton";
import { filterImageFiles } from "./media";
import styles from "./DiaryComposer.module.css";

export interface DiaryDraft {
  files: File[];
  text: string;
}

interface DiaryComposerProps {
  onSend: (draft: DiaryDraft) => Promise<void> | void;
}

const resizeTextArea = (textArea: HTMLTextAreaElement): void => {
  textArea.style.height = "auto";
  textArea.style.height = `${Math.min(textArea.scrollHeight, 168)}px`;
};

export function DiaryComposer({ onSend }: DiaryComposerProps) {
  const [files, setFiles] = useState<File[]>([]);
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string>();
  const [text, setText] = useState("");
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const previews = useMemo(
    () =>
      files.map((file, index) => ({
        file,
        key: `${file.name}-${file.lastModified}-${index}`,
        url:
          typeof URL.createObjectURL === "function"
            ? URL.createObjectURL(file)
            : undefined,
      })),
    [files],
  );

  useEffect(
    () => () => {
      for (const preview of previews) {
        if (preview.url !== undefined) {
          URL.revokeObjectURL(preview.url);
        }
      }
    },
    [previews],
  );

  const addFiles = useCallback((incoming: Iterable<File>) => {
    const images = filterImageFiles(incoming);
    if (images.length > 0) {
      setFiles((current) => [...current, ...images]);
      setSendError(undefined);
    }
  }, []);

  const canSend = !isSending && (files.length > 0 || text.trim().length > 0);

  const handleSend = async () => {
    if (!canSend) {
      return;
    }

    setIsSending(true);
    setSendError(undefined);
    try {
      await onSend({ files: [...files], text });
      setFiles([]);
      setText("");
      if (textAreaRef.current !== null) {
        textAreaRef.current.style.height = "auto";
      }
    } catch {
      setSendError("Couldn't save this entry");
    } finally {
      setIsSending(false);
    }
  };

  return (
    <form
      className={styles.composer}
      onPaste={(event) => {
        const pastedFiles = Array.from(event.clipboardData.items)
          .filter((item) => item.kind === "file" && item.type.startsWith("image/"))
          .map((item) => item.getAsFile())
          .filter((file): file is File => file !== null);
        if (pastedFiles.length > 0) {
          event.preventDefault();
          addFiles(pastedFiles);
        }
      }}
      onSubmit={(event) => {
        event.preventDefault();
        void handleSend();
      }}
    >
      {previews.length === 0 ? null : (
        <div aria-label="Selected diary images" className={styles.previews}>
          {previews.map((preview, index) => (
            <div className={styles.preview} key={preview.key}>
              {preview.url === undefined ? null : (
                <img
                  alt={`Selected image ${preview.file.name}`}
                  src={preview.url}
                />
              )}
              <button
                aria-label={`Remove selected image ${preview.file.name}`}
                className={styles.remove}
                onClick={() => {
                  setFiles((current) => current.filter((_, itemIndex) => itemIndex !== index));
                }}
                type="button"
              >
                <X aria-hidden="true" size={15} strokeWidth={2} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div className={styles.row}>
        <label className={styles.addImages} title="Add diary images">
          <ImagePlus aria-hidden="true" size={21} strokeWidth={1.8} />
          <input
            accept="image/*"
            aria-label="Add diary images"
            capture="environment"
            multiple
            onChange={(event) => {
              if (event.target.files !== null) {
                addFiles(event.target.files);
              }
              event.target.value = "";
            }}
            type="file"
          />
        </label>
        <textarea
          aria-label="Diary text"
          className={styles.textarea}
          onChange={(event) => {
            setText(event.target.value);
            resizeTextArea(event.currentTarget);
          }}
          ref={textAreaRef}
          rows={1}
          value={text}
        />
        <FrostedIconButton
          className={styles.send}
          disabled={!canSend}
          icon={Send}
          label="Send diary entry"
          type="submit"
        />
      </div>
      {sendError === undefined ? null : (
        <p className={styles.error} role="alert">{sendError}</p>
      )}
    </form>
  );
}
