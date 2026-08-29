import React from 'react';

interface LightboxProps {
  isOpen: boolean;
  onClose: () => void;
  imageSrc: string;
  title: string;
  description: string;
}

export const Lightbox: React.FC<LightboxProps> = ({ isOpen, onClose, imageSrc, title, description }) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[1000] bg-black bg-opacity-90 flex items-center justify-center p-4">
      <button onClick={onClose} className="absolute top-6 right-6 text-white text-4xl font-bold p-2 z-20 hover:text-indigo-400 transition-colors">
        &times;
      </button>
      <div className="relative w-full max-w-4xl max-h-full flex flex-col items-center">
        <img src={imageSrc} alt={title} className="max-w-full max-h-[80vh] object-contain shadow-lg rounded-lg" />
        <div className="mt-6 p-4 bg-white bg-opacity-10 backdrop-blur-sm rounded-lg text-white text-center max-w-2xl">
          <h3 className="text-2xl font-bold mb-2">{title}</h3>
          <p className="text-lg">{description}</p>
        </div>
      </div>
    </div>
  );
};