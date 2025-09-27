
import React, { useRef } from 'react';
import { UploadIcon, FileIcon } from './icons';

interface FileUploadCardProps {
  title: string;
  description: string;
  file: File | null;
  onFileSelect: (file: File) => void;
  id: string;
}

const FileUploadCard: React.FC<FileUploadCardProps> = ({ title, description, file, onFileSelect, id }) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) {
      onFileSelect(event.target.files[0]);
    }
  };

  const handleClick = () => {
    inputRef.current?.click();
  };

  return (
    <div 
      className="bg-slate-800 border-2 border-dashed border-slate-600 rounded-lg p-6 text-center cursor-pointer hover:border-sky-500 transition-colors duration-300 flex flex-col items-center justify-center h-full"
      onClick={handleClick}
    >
      <input
        type="file"
        ref={inputRef}
        onChange={handleFileChange}
        className="hidden"
        id={id}
        accept="application/pdf,image/png,image/jpeg,image/webp"
      />
      {file ? (
        <div className="flex flex-col items-center space-y-2">
          <FileIcon className="w-12 h-12 text-sky-400" />
          <p className="text-slate-300 font-semibold">{title}</p>
          <p className="text-slate-400 text-sm break-all">{file.name}</p>
        </div>
      ) : (
        <div className="flex flex-col items-center space-y-2">
          <UploadIcon className="w-12 h-12 text-slate-500" />
          <p className="text-slate-300 font-semibold">{title}</p>
          <p className="text-slate-400 text-sm">{description}</p>
        </div>
      )}
    </div>
  );
};

export default FileUploadCard;
