import React, { useEffect, useState } from 'react';
import { Camera, RefreshCw } from 'lucide-react';
import { useAppStore } from '../store';

export function CameraDeviceSelector({ className = '' }: { className?: string }) {
  const { selectedCameraId, setSelectedCameraId } = useAppStore();
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [loading, setLoading] = useState(false);

  const loadDevices = async () => {
    setLoading(true);
    try {
      // Request permission first to get labels
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      stream.getTracks().forEach(t => t.stop());

      const allDevices = await navigator.mediaDevices.enumerateDevices();
      const videoDevices = allDevices.filter(d => d.kind === 'videoinput');
      setDevices(videoDevices);

      if (videoDevices.length > 0 && !selectedCameraId) {
        setSelectedCameraId(videoDevices[0].deviceId);
      }
    } catch (err) {
      console.warn("Could not list camera devices:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      <div className="flex items-center justify-between">
        <label className="text-xs font-bold text-zinc-600 dark:text-zinc-400 flex items-center gap-1.5 uppercase tracking-wider">
          <Camera size={14} className="text-pink-600" />
          Preferred Camera Device
        </label>
        <button 
          onClick={loadDevices} 
          disabled={loading}
          className="text-xs text-pink-600 hover:text-pink-700 flex items-center gap-1 font-semibold"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>
      <select
        value={selectedCameraId}
        onChange={(e) => setSelectedCameraId(e.target.value)}
        className="w-full bg-zinc-100 dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded-xl px-3 py-2 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-pink-500"
      >
        <option value="">Default System Camera</option>
        {devices.map((device, index) => (
          <option key={device.deviceId || index} value={device.deviceId}>
            {device.label || `Camera ${index + 1}`}
          </option>
        ))}
      </select>
      <p className="text-[11px] text-zinc-500">
        This camera will be used across all features on CentralTok requiring your camera (recording, verification, video calls, etc.).
      </p>
    </div>
  );
}
