import React, { useState } from 'react';
import { X } from 'lucide-react';

export function BookmarkBanner() {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const url = 'https://domain-central.github.io/domain/';

  return (
    <div className="fixed top-0 left-0 right-0 z-[3000] bg-blue-600 text-white py-1.5 px-4 text-xs md:text-sm font-medium flex items-center justify-between shadow-md">
      <div className="flex-1 text-center pr-6 truncate">
        Bookmark{' '}
        <a 
          href={url} 
          target="_blank" 
          rel="noopener noreferrer"
          className="font-bold underline text-white hover:text-blue-100 transition-colors"
        >
          {url}
        </a>
        {' '}to stay updated and find our official links if our site ever goes down
      </div>
      <button 
        onClick={() => setDismissed(true)} 
        className="text-white/80 hover:text-white p-1 rounded-lg hover:bg-blue-700/50 transition-colors shrink-0"
        title="Close"
      >
        <X size={16} />
      </button>
    </div>
  );
}
