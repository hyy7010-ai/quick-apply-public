
import React, { useState } from 'react';
import { Project, Language } from '../types';
import { Lightbox } from './Lightbox';
import { PdfViewerModal } from './PdfViewerModal';

interface ProjectDisplayProps {
  projects: Project[];
  lang?: Language;
}

export const ProjectDisplay: React.FC<ProjectDisplayProps> = ({ projects, lang = 'en' }) => {
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedImage, setSelectedImage] = useState<Project | null>(null);
  const [pdfModalOpen, setPdfModalOpen] = useState(false);
  const [selectedDocument, setSelectedDocument] = useState<Project | null>(null);

  const handleImageClick = (project: Project) => {
    setSelectedImage(project);
    setLightboxOpen(true);
  };

  const handleDocumentClick = (project: Project) => {
    setSelectedDocument(project);
    setPdfModalOpen(true);
  };

  if (!projects || projects.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-6 py-20 text-center animate-fade-in">
        <div className="w-24 h-24 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-100">
            <svg className="w-10 h-10 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
        </div>
        <h3 className="text-xl font-black text-slate-900 mb-2">Portfolio Empty</h3>
        <p className="text-slate-500 font-medium text-sm">Upload your designs, documents, or certificates to generate a showcase.</p>
      </div>
    );
  }

  return (
    <div className="max-w-[1400px] mx-auto px-6 py-20">
      <div className="flex flex-col items-center mb-16 animate-fade-in-up">
          <span className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-600 bg-indigo-50 px-4 py-2 rounded-full mb-4">Your Work</span>
          <h2 className="text-4xl md:text-5xl font-black tracking-tight text-slate-900 text-center">Portfolio Showcase</h2>
      </div>
      
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
        {projects.map((project, idx) => (
          <div
            key={project.id}
            className="group relative bg-white rounded-[2rem] shadow-sm hover:shadow-[0_20px_40px_-15px_rgba(0,0,0,0.1)] border border-slate-100 overflow-hidden cursor-pointer transition-all duration-500 hover:-translate-y-2 animate-fade-in-up"
            style={{ animationDelay: `${idx * 100}ms` }}
            onClick={() => {
              if (project.originalMimeType.startsWith('image/')) {
                handleImageClick(project);
              } else {
                handleDocumentClick(project);
              }
            }}
          >
            {/* Image Section */}
            <div className="aspect-[4/3] overflow-hidden relative bg-slate-50 flex items-center justify-center">
              {project.originalMimeType.startsWith('image/') ? (
                <img 
                    src={`data:${project.originalMimeType};base64,${project.base64Data}`} 
                    alt={project.title} 
                    className="object-contain w-full h-full transition-transform duration-700 group-hover:scale-105" 
                />
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center bg-slate-50 text-slate-400 group-hover:bg-slate-100 transition-colors">
                  <div className="w-16 h-16 bg-white rounded-2xl shadow-sm flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                     <svg className="w-8 h-8 text-indigo-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Document</span>
                </div>
              )}
              
              {/* Overlay Gradient */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none"></div>

              {/* Floating Badge */}
              <div className="absolute top-4 left-4 z-10">
                  <span className="inline-flex items-center px-3 py-1.5 rounded-xl bg-white/90 backdrop-blur-md shadow-sm border border-white/20 text-[9px] font-black uppercase tracking-widest text-slate-900">
                      {project.type}
                  </span>
              </div>
            </div>

            {/* Content Section */}
            <div className="p-6 relative">
              <div className="flex justify-between items-start mb-3 gap-4">
                  <h3 className="text-lg font-black text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors line-clamp-2">
                      {project.title}
                  </h3>
                  <div className="w-8 h-8 rounded-full bg-slate-50 flex items-center justify-center text-slate-300 shrink-0 group-hover:bg-indigo-600 group-hover:text-white transition-all duration-300 shadow-sm group-hover:shadow-md">
                      <svg className="w-4 h-4 transform group-hover:-rotate-45 transition-transform duration-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                  </div>
              </div>
              <p className="text-xs font-medium text-slate-500 line-clamp-2 leading-relaxed">
                  {project.description}
              </p>
            </div>
          </div>
        ))}
      </div>

      {lightboxOpen && selectedImage && (
        <Lightbox
          isOpen={lightboxOpen}
          onClose={() => setLightboxOpen(false)}
          imageSrc={`data:${selectedImage.originalMimeType};base64,${selectedImage.base64Data}`}
          title={selectedImage.title}
          description={selectedImage.description}
        />
      )}

      {pdfModalOpen && selectedDocument && (
        <PdfViewerModal
          isOpen={pdfModalOpen}
          onClose={() => setPdfModalOpen(false)}
          documentData={selectedDocument.base64Data}
          mimeType={selectedDocument.originalMimeType}
          title={selectedDocument.title}
          lang={lang}
          initialSummary={selectedDocument.description}
          initialKeyPoints={selectedDocument.associatedSkills}
        />
      )}
    </div>
  );
};
