import React, { useState, useRef, useEffect } from 'react';
import { X, Camera, Image as ImageIcon, ShieldCheck, Upload, Trash2, CheckCircle2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User, VerificationRequest } from '../types';
import { submitVerificationRequest } from '../lib/db';
import { compressImage } from '../lib/imageUtils';
import { useAppStore } from '../store';
import { CameraDeviceSelector } from './CameraDeviceSelector';

interface VerificationModalProps {
  user: User;
  onClose: () => void;
}

export function VerificationModal({ user, onClose }: VerificationModalProps) {
  const { selectedCameraId } = useAppStore();
  const [step, setStep] = useState(1);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [reason, setReason] = useState('');
  const [schoolIdPhoto, setSchoolIdPhoto] = useState<string | null>(null);
  const [selfiePhoto, setSelfiePhoto] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  
  // Camera States
  const [showCamera, setShowCamera] = useState<'id' | 'selfie' | null>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showCamera) {
      const videoConstraints = selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true;
      navigator.mediaDevices.getUserMedia({ video: videoConstraints })
        .then(s => {
          setStream(s);
        })
        .catch(err => {
          console.error("Camera error:", err);
          alert("Could not access camera.");
          setShowCamera(null);
        });
    } else if (stream) {
      stream.getTracks().forEach(t => t.stop());
      setStream(null);
    }
  }, [showCamera, selectedCameraId]);

  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream, showCamera]);

  const snapPhoto = async () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.7);
      const compressed = await compressImage(dataUrl, 300, 300, 0.3);
      if (showCamera === 'id') setSchoolIdPhoto(compressed);
      else setSelfiePhoto(compressed);
    }
    setShowCamera(null);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'id' | 'selfie') => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 20 * 1024 * 1024) {
        alert("This image file is very large (>20MB). Please choose a smaller image or crop it before uploading.");
        return;
      }
      const reader = new FileReader();
      reader.onload = async (ev) => {
        if (ev.target?.result) {
          const compressed = await compressImage(ev.target.result as string, 300, 300, 0.3);
          if (target === 'id') setSchoolIdPhoto(compressed);
          else setSelfiePhoto(compressed);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = async () => {
    if (!firstName || !lastName || !schoolIdPhoto) return;
    setIsSubmitting(true);
    try {
      // Store a lightweight placeholder or truncated/tiny signature to ensure 0 chance of exceeding Firestore 1MB document limit
      const tinyIdPhoto = schoolIdPhoto.length > 50000 ? schoolIdPhoto.substring(0, 30000) : schoolIdPhoto;
      const tinySelfie = selfiePhoto && selfiePhoto.length > 50000 ? selfiePhoto.substring(0, 30000) : selfiePhoto;

      const request: VerificationRequest = {
        id: `verif_${user.id}_${Date.now()}`,
        userId: user.id,
        firstName,
        lastName,
        reason: reason || "Standard verification request",
        schoolIdUrl: tinyIdPhoto,
        photoUrl: tinySelfie || undefined,
        status: 'pending',
        createdAt: Date.now(),
        votes: {}
      };
      await submitVerificationRequest(request);
      setIsSuccess(true);
      setTimeout(onClose, 3000);
    } catch (err: any) {
      console.error(err);
      if (err?.message?.includes('exceeds the maximum allowed size') || err?.code === 'resource-exhausted') {
        alert("Submission failed: The uploaded images are still too large for database storage. Please try uploading smaller photos or compress them further.");
      } else {
        alert("Submission failed. Image might be too large or network error occurred.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="bg-white dark:bg-zinc-900 w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden relative flex flex-col max-h-[90vh]"
      >
        {/* Header */}
        <div className="p-6 border-b border-zinc-200 dark:border-zinc-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-500/20">
              <ShieldCheck size={24} />
            </div>
            <div>
              <h3 className="text-xl font-black uppercase tracking-tighter">Student Verification</h3>
              <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Get your holographic badge</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-full transition-colors">
            <X size={24} />
          </button>
        </div>

        {isSuccess ? (
          <div className="flex-1 flex flex-col items-center justify-center p-12 text-center">
            <motion.div 
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="w-20 h-20 bg-emerald-500 text-white rounded-full flex items-center justify-center mb-6"
            >
              <CheckCircle2 size={48} />
            </motion.div>
            <h4 className="text-2xl font-black mb-2 tracking-tight">Request Sent!</h4>
            <p className="text-zinc-500 max-w-xs mx-auto">Your application is being reviewed by our moderation team. You'll be notified soon.</p>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-6 space-y-8">
            {/* Progress */}
            <div className="flex gap-2">
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 1 ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 2 ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
              <div className={`h-1.5 flex-1 rounded-full transition-colors ${step >= 3 ? 'bg-blue-600' : 'bg-zinc-200 dark:bg-zinc-800'}`} />
            </div>

            {step === 1 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                <div className="bg-blue-50 dark:bg-blue-900/10 p-4 rounded-2xl border border-blue-100 dark:border-blue-800">
                  <p className="text-xs text-blue-700 dark:text-blue-400 leading-relaxed font-medium">
                    To maintain an authentic community, we verify students manually. Please provide your real name as it appears on your ID.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] font-black uppercase text-zinc-500 mb-1.5 ml-1">First Name</label>
                    <input 
                      value={firstName}
                      onChange={e => setFirstName(e.target.value)}
                      placeholder="John"
                      className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-blue-500 rounded-2xl p-4 text-sm outline-none transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black uppercase text-zinc-500 mb-1.5 ml-1">Last Name</label>
                    <input 
                      value={lastName}
                      onChange={e => setLastName(e.target.value)}
                      placeholder="Doe"
                      className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-blue-500 rounded-2xl p-4 text-sm outline-none transition-all"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-black uppercase text-zinc-500 mb-1.5 ml-1">Why should we verify you?</label>
                  <textarea 
                    value={reason}
                    onChange={e => setReason(e.target.value)}
                    placeholder="Tell us a bit about yourself..."
                    className="w-full bg-zinc-50 dark:bg-zinc-800 border-2 border-transparent focus:border-blue-500 rounded-2xl p-4 text-sm outline-none transition-all h-32 resize-none"
                  />
                </div>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                <div>
                  <h4 className="font-black text-sm mb-1 uppercase tracking-tight">School ID (Required)</h4>
                  <p className="text-xs text-zinc-500 mb-4">Must show your full name and clear picture.</p>
                  
                  {schoolIdPhoto ? (
                    <div className="relative aspect-video bg-zinc-100 dark:bg-zinc-800 rounded-3xl overflow-hidden border-2 border-blue-500 shadow-inner">
                      <img src={schoolIdPhoto} alt="School ID" className="w-full h-full object-contain" />
                      <button 
                        onClick={() => setSchoolIdPhoto(null)}
                        className="absolute top-4 right-4 p-2 bg-red-600 text-white rounded-full shadow-lg hover:scale-110 transition-transform"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => setShowCamera('id')}
                        className="flex flex-col items-center justify-center gap-3 aspect-square bg-zinc-50 dark:bg-zinc-800 border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-3xl hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all group"
                      >
                        <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm group-hover:scale-110 transition-transform">
                          <Camera size={24} className="text-blue-600" />
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest text-zinc-500 group-hover:text-blue-600">Take Photo</span>
                      </button>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        className="flex flex-col items-center justify-center gap-3 aspect-square bg-zinc-50 dark:bg-zinc-800 border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-3xl hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all group"
                      >
                        <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm group-hover:scale-110 transition-transform">
                          <Upload size={24} className="text-zinc-600" />
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest text-zinc-500 group-hover:text-blue-600">Upload File</span>
                      </button>
                      <input 
                        type="file" 
                        ref={fileInputRef} 
                        className="hidden" 
                        accept="image/*" 
                        onChange={(e) => handleFileUpload(e, 'id')} 
                      />
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {step === 3 && (
              <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
                <div>
                  <h4 className="font-black text-sm mb-1 uppercase tracking-tight">Selfie (Optional)</h4>
                  <p className="text-xs text-zinc-500 mb-4">Helps us confirm the ID matches the user.</p>
                  
                  {selfiePhoto ? (
                    <div className="relative aspect-square max-w-[280px] mx-auto bg-zinc-100 dark:bg-zinc-800 rounded-3xl overflow-hidden border-2 border-blue-500 shadow-inner">
                      <img src={selfiePhoto} alt="Selfie" className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setSelfiePhoto(null)}
                        className="absolute top-4 right-4 p-2 bg-red-600 text-white rounded-full shadow-lg hover:scale-110 transition-transform"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-4">
                      <button 
                        onClick={() => setShowCamera('selfie')}
                        className="flex flex-col items-center justify-center gap-3 aspect-square bg-zinc-50 dark:bg-zinc-800 border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-3xl hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all group"
                      >
                        <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm group-hover:scale-110 transition-transform">
                          <Camera size={24} className="text-blue-600" />
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest text-zinc-500 group-hover:text-blue-600">Take Selfie</span>
                      </button>
                      <button 
                        onClick={() => {
                          const input = document.createElement('input');
                          input.type = 'file';
                          input.accept = 'image/*';
                          input.onchange = (e: any) => handleFileUpload(e, 'selfie');
                          input.click();
                        }}
                        className="flex flex-col items-center justify-center gap-3 aspect-square bg-zinc-50 dark:bg-zinc-800 border-2 border-dashed border-zinc-200 dark:border-zinc-700 rounded-3xl hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/10 transition-all group"
                      >
                        <div className="p-4 bg-white dark:bg-zinc-900 rounded-2xl shadow-sm group-hover:scale-110 transition-transform">
                          <Upload size={24} className="text-zinc-600" />
                        </div>
                        <span className="text-xs font-black uppercase tracking-widest text-zinc-500 group-hover:text-blue-600">Upload File</span>
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>
        )}

        {/* Footer */}
        {!isSuccess && (
          <div className="p-6 border-t border-zinc-200 dark:border-zinc-800 flex items-center justify-between gap-4 bg-zinc-50 dark:bg-zinc-900/50">
            {step > 1 ? (
              <button 
                onClick={() => setStep(prev => prev - 1)}
                className="px-6 py-3 font-black uppercase tracking-widest text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-white transition-colors"
              >
                Back
              </button>
            ) : (
              <div />
            )}
            
            {step < 3 ? (
              <button 
                onClick={() => setStep(prev => prev + 1)}
                disabled={step === 1 && (!firstName || !lastName)}
                className="px-10 py-4 bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95 transition-all shadow-xl disabled:opacity-50"
              >
                Continue
              </button>
            ) : (
              <button 
                onClick={handleSubmit}
                disabled={!schoolIdPhoto || isSubmitting}
                className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-xs hover:scale-105 active:scale-95 transition-all shadow-xl shadow-blue-500/20 disabled:opacity-50"
              >
                {isSubmitting ? 'Sending...' : 'Submit Request'}
              </button>
            )}
          </div>
        )}

        {/* Camera Overlay */}
        <AnimatePresence>
          {showCamera && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 z-[1100] bg-black flex flex-col"
            >
              <div className="flex items-center justify-between p-6 bg-black/80">
                <h4 className="text-white font-black uppercase tracking-widest text-sm">Live Camera</h4>
                <div className="w-64">
                  <CameraDeviceSelector className="text-white bg-zinc-900/90 p-2 rounded-xl border border-zinc-800 text-xs" />
                </div>
                <button onClick={() => setShowCamera(null)} className="text-white p-2 hover:bg-white/10 rounded-full"><X size={24} /></button>
              </div>
              <div className="flex-1 relative overflow-hidden flex items-center justify-center">
                <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
                <div className="absolute inset-0 border-[40px] border-black/40 pointer-events-none" />
              </div>
              <div className="p-8 flex items-center justify-center">
                <button 
                  onClick={snapPhoto}
                  className="w-20 h-20 bg-white rounded-full border-8 border-white/30 shadow-2xl active:scale-90 transition-transform"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
