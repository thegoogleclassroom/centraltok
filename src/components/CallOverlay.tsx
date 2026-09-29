import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  PhoneOff, Mic, MicOff, Volume2, VolumeX, 
  Settings, Monitor, Camera, Grid, 
  UserPlus, MessageSquare, Video, VideoOff,
  Phone, X, Check
} from 'lucide-react';
import { useAppStore } from '../store';
import { createCall, updateCall, addIceCandidate, subscribeToCall, deleteCall, getUsers, db } from '../lib/db';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { CameraDeviceSelector } from './CameraDeviceSelector';

const servers: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' },
    { urls: 'stun:stun3.l.google.com:19302' },
    { urls: 'stun:stun4.l.google.com:19302' },
  ],
  iceCandidatePoolSize: 10,
};

// Web Audio API helper for real voice activity detection
function setupAudioAnalyzer(stream: MediaStream, onSpeakingChange: (speaking: boolean) => void): () => void {
  try {
    const audioTracks = stream.getAudioTracks();
    if (!audioTracks || audioTracks.length === 0) return () => {};

    const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioContextClass) return () => {};

    const audioCtx = new AudioContextClass();
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }

    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.4;
    source.connect(analyser);

    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    let isSpeakingCurrent = false;
    let animId: number;

    const checkVolume = () => {
      analyser.getByteFrequencyData(dataArray);
      let sum = 0;
      for (let i = 0; i < bufferLength; i++) {
        sum += dataArray[i];
      }
      const average = sum / bufferLength;
      // Speech volume threshold (ranges 0-255)
      const speaking = average > 14;
      if (speaking !== isSpeakingCurrent) {
        isSpeakingCurrent = speaking;
        onSpeakingChange(speaking);
      }
      animId = requestAnimationFrame(checkVolume);
    };
    checkVolume();

    return () => {
      cancelAnimationFrame(animId);
      try {
        source.disconnect();
        analyser.disconnect();
        audioCtx.close().catch(() => {});
      } catch (e) {
        // ignore cleanup errors
      }
    };
  } catch (e) {
    console.warn("Could not setup audio analyzer:", e);
    return () => {};
  }
}

export function CallOverlay() {
  const { isCalling, setIsCalling, callData, currentUser, setCallData, selectedCameraId } = useAppStore();
  const [isMuted, setIsMuted] = useState(false);
  const [isDeafened, setIsDeafened] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [remoteIsSpeaking, setRemoteIsSpeaking] = useState(false);
  const [callStatus, setCallStatus] = useState<'idle' | 'calling' | 'ringing' | 'active'>('idle');
  const [showCameraSettings, setShowCameraSettings] = useState(false);
  
  const pc = useRef<RTCPeerConnection | null>(null);
  const localStream = useRef<MediaStream | null>(null);
  const remoteStream = useRef<MediaStream | null>(null);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const remoteAudioRef = useRef<HTMLAudioElement>(null);
  const callIdRef = useRef<string | null>(null);

  const callUnsubRef = useRef<(() => void) | null>(null);
  const isSettingRemoteDesc = useRef<boolean>(false);
  const processedCandidates = useRef<Set<string>>(new Set());
  const candidatesQueue = useRef<RTCIceCandidateInit[]>([]);
  const cleanupTimerRef = useRef<any>(null);
  const localAnalyzerCleanupRef = useRef<(() => void) | null>(null);
  const remoteAnalyzerCleanupRef = useRef<(() => void) | null>(null);

  // Helper to attach and play remote audio
  const attachRemoteAudio = () => {
    if (remoteAudioRef.current && remoteStream.current) {
      remoteAudioRef.current.srcObject = remoteStream.current;
      remoteAudioRef.current.play().catch(e => {
        console.warn("Auto-play blocked or waiting for user interaction:", e);
      });
    }
  };

  // Listen for incoming calls
  useEffect(() => {
    if (!currentUser) return;

    const q = query(
      collection(db, 'calls'), 
      where('receiverId', '==', currentUser.id),
      where('status', '==', 'initiating')
    );

    const unsub = onSnapshot(q, (snapshot) => {
      snapshot.docChanges().forEach(async (change) => {
        if (change.type === 'added') {
          const data = change.doc.data();
          // Filter out stale calls older than 60 seconds
          if (data.timestamp && Date.now() - data.timestamp > 60000) return;

          if (!isCalling && callStatus === 'idle') {
            try {
              const users = await getUsers();
              const caller = users.find(u => u.id === data.callerId);
              if (caller) {
                setCallData({ user: caller, type: data.type || 'voice' });
                setIsCalling(true);
                setCallStatus('ringing');
                callIdRef.current = data.id;
              }
            } catch (err) {
              console.error("Failed to load caller info:", err);
            }
          }
        }
      });
    }, (err) => {
      console.warn("Incoming calls snapshot warning:", err);
    });

    return () => unsub();
  }, [currentUser?.id, isCalling, callStatus, setCallData, setIsCalling]);

  // If ringing, listen to see if the caller hangs up before we answer
  useEffect(() => {
    if (callStatus === 'ringing' && callIdRef.current) {
      const unsub = subscribeToCall(callIdRef.current, (data) => {
        if (!data || data.status === 'ended') {
          handleEndCall(false);
        }
      });
      return () => unsub();
    }
  }, [callStatus]);

  // Handle Call Lifecycle for Caller
  useEffect(() => {
    if (!isCalling || !callData || !currentUser) return;

    if (callStatus === 'idle') {
      const isCaller = !callIdRef.current;
      if (isCaller) {
        setCallStatus('calling');
        startCall();
      }
    }

    async function startCall() {
      // Clear any pending old call deletion timer
      if (cleanupTimerRef.current) {
        clearTimeout(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
      if (callUnsubRef.current) {
        callUnsubRef.current();
        callUnsubRef.current = null;
      }

      // Generate a unique session call ID to completely prevent collisions with previous calls
      const sessionCallId = `call_${currentUser!.id}_${callData!.user.id}_${Date.now()}`;
      callIdRef.current = sessionCallId;
      processedCandidates.current.clear();
      candidatesQueue.current = [];
      isSettingRemoteDesc.current = false;
      
      const newPc = new RTCPeerConnection(servers);
      pc.current = newPc;
      remoteStream.current = new MediaStream();

      try {
        const videoConstraints = selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true;
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isCameraOn ? videoConstraints : false });
        localStream.current = stream;
        stream.getTracks().forEach((track) => {
          newPc.addTrack(track, stream);
        });

        // Setup real voice activity analyzer
        localAnalyzerCleanupRef.current?.();
        localAnalyzerCleanupRef.current = setupAudioAnalyzer(stream, setIsSpeaking);
      } catch (err) {
        console.error("Microphone error:", err);
      }

      newPc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          remoteStream.current = event.streams[0];
        } else if (event.track) {
          if (!remoteStream.current) remoteStream.current = new MediaStream();
          remoteStream.current.addTrack(event.track);
        }

        attachRemoteAudio();

        if (remoteVideoRef.current && remoteStream.current) {
          remoteVideoRef.current.srcObject = remoteStream.current;
        }

        if (remoteStream.current) {
          remoteAnalyzerCleanupRef.current?.();
          remoteAnalyzerCleanupRef.current = setupAudioAnalyzer(remoteStream.current, setRemoteIsSpeaking);
        }
      };

      newPc.onicecandidate = (event) => {
        if (event.candidate && callIdRef.current === sessionCallId) {
          addIceCandidate(sessionCallId, 'caller', event.candidate.toJSON());
        }
      };

      newPc.oniceconnectionstatechange = () => {
        console.log("Caller ICE connection state:", newPc.iceConnectionState);
        if (newPc.iceConnectionState === 'connected' || newPc.iceConnectionState === 'completed') {
          attachRemoteAudio();
        }
      };

      const offerDescription = await newPc.createOffer();
      await newPc.setLocalDescription(offerDescription);

      await createCall(sessionCallId, currentUser!.id, callData!.user.id, {
        type: offerDescription.type,
        sdp: offerDescription.sdp,
      });

      // Subscribe to signaling updates
      const unsub = subscribeToCall(sessionCallId, async (data) => {
        if (!data || pc.current !== newPc) return;

        if (data.status === 'ended') {
          handleEndCall(false);
          return;
        }

        if (data.status === 'active' && callStatus !== 'active') {
          setCallStatus('active');
        }

        // Set remote answer description safely without race conditions
        if (data.answer && newPc.signalingState === 'have-local-offer' && !isSettingRemoteDesc.current) {
          isSettingRemoteDesc.current = true;
          try {
            await newPc.setRemoteDescription(new RTCSessionDescription(data.answer));
            setCallStatus('active');
            attachRemoteAudio();

            // Drain queued ICE candidates
            while (candidatesQueue.current.length > 0) {
              const cand = candidatesQueue.current.shift();
              if (cand && newPc.remoteDescription) {
                try {
                  await newPc.addIceCandidate(new RTCIceCandidate(cand));
                } catch (e) {
                  console.warn("Error adding queued receiver candidate:", e);
                }
              }
            }
          } catch (err) {
            console.error("Error setting remote answer description:", err);
          } finally {
            isSettingRemoteDesc.current = false;
          }
        }

        // Process receiver ICE candidates with deduplication
        if (Array.isArray(data.receiverCandidates)) {
          for (const candidate of data.receiverCandidates) {
            if (!candidate || !candidate.candidate) continue;
            const key = `${candidate.candidate}_${candidate.sdpMid}_${candidate.sdpMLineIndex}`;
            if (processedCandidates.current.has(key)) continue;
            processedCandidates.current.add(key);

            if (newPc.remoteDescription && newPc.remoteDescription.type) {
              try {
                await newPc.addIceCandidate(new RTCIceCandidate(candidate));
              } catch (e) {
                console.warn("Error adding receiver candidate:", e);
              }
            } else {
              candidatesQueue.current.push(candidate);
            }
          }
        }
      });

      callUnsubRef.current = unsub;
    }
  }, [isCalling, callData, currentUser, callStatus]);

  // Synchronize media video elements
  useEffect(() => {
    if (callStatus === 'active' || isCameraOn) {
      if (localStream.current && localVideoRef.current) {
        localVideoRef.current.srcObject = localStream.current;
      }
      if (remoteStream.current) {
        if (remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream.current;
        attachRemoteAudio();
      }
    }
  }, [callStatus, isCameraOn, isCalling]);

  const acceptCall = async () => {
    const sessionCallId = callIdRef.current;
    if (!sessionCallId || !currentUser) return;
    
    if (cleanupTimerRef.current) {
      clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = null;
    }
    if (callUnsubRef.current) {
      callUnsubRef.current();
      callUnsubRef.current = null;
    }

    setCallStatus('active');
    processedCandidates.current.clear();
    candidatesQueue.current = [];
    isSettingRemoteDesc.current = false;

    const newPc = new RTCPeerConnection(servers);
    pc.current = newPc;
    remoteStream.current = new MediaStream();

    try {
      const videoConstraints = selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true;
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: isCameraOn ? videoConstraints : false });
      localStream.current = stream;
      stream.getTracks().forEach((track) => {
        newPc.addTrack(track, stream);
      });

      // Setup real voice activity analyzer
      localAnalyzerCleanupRef.current?.();
      localAnalyzerCleanupRef.current = setupAudioAnalyzer(stream, setIsSpeaking);
    } catch (err) {
      console.error("Media error:", err);
    }

    newPc.ontrack = (event) => {
      if (event.streams && event.streams[0]) {
        remoteStream.current = event.streams[0];
      } else if (event.track) {
        if (!remoteStream.current) remoteStream.current = new MediaStream();
        remoteStream.current.addTrack(event.track);
      }

      attachRemoteAudio();

      if (remoteVideoRef.current && remoteStream.current) {
        remoteVideoRef.current.srcObject = remoteStream.current;
      }

      if (remoteStream.current) {
        remoteAnalyzerCleanupRef.current?.();
        remoteAnalyzerCleanupRef.current = setupAudioAnalyzer(remoteStream.current, setRemoteIsSpeaking);
      }
    };

    newPc.onicecandidate = (event) => {
      if (event.candidate && callIdRef.current === sessionCallId) {
        addIceCandidate(sessionCallId, 'receiver', event.candidate.toJSON());
      }
    };

    newPc.oniceconnectionstatechange = () => {
      console.log("Receiver ICE connection state:", newPc.iceConnectionState);
      if (newPc.iceConnectionState === 'connected' || newPc.iceConnectionState === 'completed') {
        attachRemoteAudio();
      }
    };

    const unsub = subscribeToCall(sessionCallId, async (data) => {
      if (!data || pc.current !== newPc) return;

      if (data.status === 'ended') {
        handleEndCall(false);
        return;
      }

      // Process offer only when in 'stable' state and not already processing
      if (data.offer && newPc.signalingState === 'stable' && !isSettingRemoteDesc.current && !newPc.currentRemoteDescription) {
        isSettingRemoteDesc.current = true;
        try {
          await newPc.setRemoteDescription(new RTCSessionDescription(data.offer));
          const answer = await newPc.createAnswer();
          await newPc.setLocalDescription(answer);

          await updateCall(sessionCallId, {
            answer: { type: answer.type, sdp: answer.sdp },
            status: 'active'
          });

          attachRemoteAudio();

          // Process queued caller candidates
          while (candidatesQueue.current.length > 0) {
            const cand = candidatesQueue.current.shift();
            if (cand && newPc.remoteDescription) {
              try {
                await newPc.addIceCandidate(new RTCIceCandidate(cand));
              } catch (e) {
                console.warn("Error adding queued caller candidate:", e);
              }
            }
          }
        } catch (err) {
          console.error("Error setting remote offer / creating answer:", err);
        } finally {
          isSettingRemoteDesc.current = false;
        }
      }

      // Process caller ICE candidates with deduplication
      if (Array.isArray(data.callerCandidates)) {
        for (const candidate of data.callerCandidates) {
          if (!candidate || !candidate.candidate) continue;
          const key = `${candidate.candidate}_${candidate.sdpMid}_${candidate.sdpMLineIndex}`;
          if (processedCandidates.current.has(key)) continue;
          processedCandidates.current.add(key);

          if (newPc.remoteDescription && newPc.remoteDescription.type) {
            try {
              await newPc.addIceCandidate(new RTCIceCandidate(candidate));
            } catch (e) {
              console.warn("Error adding caller candidate:", e);
            }
          } else {
            candidatesQueue.current.push(candidate);
          }
        }
      }
    });

    callUnsubRef.current = unsub;
  };

  const handleEndCall = async (shouldUpdateDb = true) => {
    const currentId = callIdRef.current;
    
    // Stop listening to signaling updates
    if (callUnsubRef.current) {
      callUnsubRef.current();
      callUnsubRef.current = null;
    }

    // Stop audio analyzers
    localAnalyzerCleanupRef.current?.();
    localAnalyzerCleanupRef.current = null;
    remoteAnalyzerCleanupRef.current?.();
    remoteAnalyzerCleanupRef.current = null;

    if (shouldUpdateDb && currentId) {
      try {
        await updateCall(currentId, { status: 'ended' });
        cleanupTimerRef.current = setTimeout(() => {
          try {
            deleteCall(currentId);
          } catch (e) {
            console.warn("Could not delete call doc:", e);
          }
        }, 3000);
      } catch (err) {
        console.error("Failed to update call status in DB:", err);
      }
    }
    
    // Stop and release all tracks
    if (localStream.current) {
      localStream.current.getTracks().forEach(t => t.stop());
      localStream.current = null;
    }
    if (remoteStream.current) {
      remoteStream.current.getTracks().forEach(t => t.stop());
      remoteStream.current = null;
    }

    if (pc.current) {
      pc.current.ontrack = null;
      pc.current.onicecandidate = null;
      pc.current.oniceconnectionstatechange = null;
      pc.current.close();
      pc.current = null;
    }

    isSettingRemoteDesc.current = false;
    processedCandidates.current.clear();
    candidatesQueue.current = [];

    setIsCalling(false);
    setCallStatus('idle');
    setCallData(null);
    callIdRef.current = null;
    setIsCameraOn(false);
    setIsScreenSharing(false);
    setIsSpeaking(false);
    setRemoteIsSpeaking(false);
  };

  const toggleCamera = async () => {
    if (!isCameraOn) {
      try {
        const videoConstraints = selectedCameraId ? { deviceId: { exact: selectedCameraId } } : true;
        const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints });
        const videoTrack = stream.getVideoTracks()[0];
        if (localStream.current) {
          localStream.current.addTrack(videoTrack);
        } else {
          localStream.current = stream;
        }
        if (pc.current) {
          const sender = pc.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(videoTrack);
          } else {
            pc.current.addTrack(videoTrack, localStream.current);
          }
        }
        if (localVideoRef.current && localStream.current) {
          localVideoRef.current.srcObject = localStream.current;
        }
        setIsCameraOn(true);
      } catch (err) {
        console.error("Camera error:", err);
      }
    } else {
      const videoTrack = localStream.current?.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.stop();
        localStream.current?.removeTrack(videoTrack);
        if (pc.current) {
          const sender = pc.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) sender.replaceTrack(null);
        }
        setIsCameraOn(false);
      }
    }
  };

  const toggleScreenShare = async () => {
    if (!isScreenSharing) {
      try {
        const stream = await (navigator.mediaDevices as any).getDisplayMedia({ video: true });
        const screenTrack = stream.getVideoTracks()[0];
        screenTrack.onended = () => {
          setIsScreenSharing(false);
          if (pc.current) {
            const sender = pc.current.getSenders().find(s => s.track?.kind === 'video');
            if (sender) sender.replaceTrack(null);
          }
        };
        if (pc.current) {
          const sender = pc.current.getSenders().find(s => s.track?.kind === 'video');
          if (sender) {
            sender.replaceTrack(screenTrack);
          } else if (localStream.current) {
            pc.current.addTrack(screenTrack, localStream.current);
          }
        }
        setIsScreenSharing(true);
      } catch (err) {
        console.error("Screenshare error:", err);
      }
    } else {
      setIsScreenSharing(false);
      if (pc.current) {
        const sender = pc.current.getSenders().find(s => s.track?.kind === 'video');
        if (sender) sender.replaceTrack(null);
      }
      if (isCameraOn) toggleCamera();
    }
  };

  useEffect(() => {
    localStream.current?.getAudioTracks().forEach(t => t.enabled = !isMuted);
  }, [isMuted]);

  useEffect(() => {
    if (remoteAudioRef.current) {
      remoteAudioRef.current.muted = isDeafened;
    }
  }, [isDeafened]);

  if (!isCalling || !callData) return null;

  return (
    <AnimatePresence>
      <motion.div 
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 100 }}
        className="fixed inset-0 z-[3000] bg-[#1E1F22] flex flex-col overflow-hidden font-sans"
      >
        <audio ref={remoteAudioRef} autoPlay playsInline />
        
        <div className="h-12 border-b border-black/20 flex items-center justify-between px-4 bg-[#313338]">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 ${callStatus === 'active' ? 'bg-[#23A559]' : 'bg-yellow-500'} rounded-full animate-pulse`} />
            <span className="text-white font-bold text-sm tracking-tight">
              {callStatus === 'ringing' ? 'Incoming Call...' : callStatus === 'calling' ? 'Calling...' : `In Call: ${callData.user.username}`}
            </span>
          </div>
          <div className="flex items-center gap-3">
             <button className="text-[#B5BAC1] hover:text-white transition-colors p-1"><UserPlus size={20} /></button>
             <button className="text-[#B5BAC1] hover:text-white transition-colors p-1"><MessageSquare size={20} /></button>
             <button className="text-[#B5BAC1] hover:text-white transition-colors p-1"><Grid size={20} /></button>
             <button className="text-[#B5BAC1] hover:text-white transition-colors p-1"><Settings size={20} /></button>
          </div>
        </div>

        <div className="flex-1 relative bg-[#2B2D31] flex items-center justify-center p-4">
          {callStatus === 'ringing' ? (
            <div className="flex flex-col items-center gap-8">
              <div className="w-32 h-32 rounded-full overflow-hidden border-4 border-[#23A559] shadow-2xl relative">
                <img src={callData.user.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${callData.user.username}`} alt="" className="w-full h-full object-cover" />
                <div className="absolute inset-0 bg-black/20 animate-pulse" />
              </div>
              <div className="text-center">
                <h2 className="text-3xl font-black text-white mb-2">{callData.user.username}</h2>
                <p className="text-[#B5BAC1] font-medium uppercase tracking-widest text-xs">Incoming Voice Call</p>
              </div>
              <div className="flex gap-6">
                <button onClick={() => handleEndCall(true)} className="w-16 h-16 bg-[#F23F42] hover:bg-[#D83C3E] rounded-full flex items-center justify-center text-white shadow-lg transition-transform active:scale-90">
                  <X size={32} />
                </button>
                <button onClick={acceptCall} className="w-16 h-16 bg-[#23A559] hover:bg-[#1A8344] rounded-full flex items-center justify-center text-white shadow-lg transition-transform active:scale-90">
                  <Check size={32} />
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-6xl h-full items-center">
               <div className="flex flex-col items-center gap-4 group">
                 <div className={`w-32 h-32 md:w-48 md:h-48 rounded-full overflow-hidden bg-[#313338] relative transition-all duration-300 ${isSpeaking ? 'ring-4 ring-[#23A559] shadow-[0_0_20px_rgba(35,165,89,0.4)]' : 'ring-2 ring-transparent'}`}>
                   {isCameraOn ? <video ref={localVideoRef} autoPlay muted playsInline className="w-full h-full object-cover scale-x-[-1]" /> : <img src={currentUser?.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${currentUser?.username}`} alt="" className="w-full h-full object-cover" />}
                   {isMuted && <div className="absolute inset-0 bg-black/40 flex items-center justify-center"><MicOff size={32} className="text-red-500" /></div>}
                 </div>
                 <div className="bg-[#1E1F22] px-4 py-1.5 rounded-full text-white text-sm font-bold shadow-lg">You</div>
               </div>
               <div className="flex flex-col items-center gap-4 group">
                 <div className={`w-32 h-32 md:w-48 md:h-48 rounded-full overflow-hidden bg-[#313338] relative transition-all duration-300 ${remoteIsSpeaking ? 'ring-4 ring-[#23A559] shadow-[0_0_20px_rgba(35,165,89,0.4)]' : 'ring-2 ring-transparent'}`}>
                   <video ref={remoteVideoRef} autoPlay playsInline className="w-full h-full object-cover" />
                   {/* Fallback image if no video stream yet */}
                   <div className="absolute inset-0 flex items-center justify-center bg-[#313338] -z-10">
                     <img src={callData.user.avatarUrl || `https://api.dicebear.com/7.x/avataaars/svg?seed=${callData.user.username}`} alt="" className="w-full h-full object-cover" />
                   </div>
                 </div>
                 <div className="bg-[#1E1F22] px-4 py-1.5 rounded-full text-white text-sm font-bold shadow-lg flex items-center gap-2">
                   {callData.user.username}
                   {callStatus === 'calling' && <span className="text-[10px] text-yellow-500 animate-pulse">Calling...</span>}
                 </div>
               </div>
            </div>
          )}
        </div>

        <div className="h-24 bg-[#1E1F22] flex items-center justify-center px-4 gap-4">
           <div className="flex items-center gap-2 bg-[#2B2D31] p-1.5 rounded-2xl shadow-xl">
             <button onClick={() => setIsMuted(!isMuted)} className={`p-3 rounded-xl transition-all ${isMuted ? 'bg-[#F23F42] text-white' : 'text-[#DBDEE1] hover:bg-[#35373C]'}`}>{isMuted ? <MicOff size={24} /> : <Mic size={24} />}</button>
             <button onClick={() => setIsDeafened(!isDeafened)} className={`p-3 rounded-xl transition-all ${isDeafened ? 'bg-[#F23F42] text-white' : 'text-[#DBDEE1] hover:bg-[#35373C]'}`}>{isDeafened ? <VolumeX size={24} /> : <Volume2 size={24} />}</button>
           </div>
           <div className="flex items-center gap-2 bg-[#2B2D31] p-1.5 rounded-2xl shadow-xl">
             <button onClick={toggleCamera} className={`p-3 rounded-xl transition-all ${isCameraOn ? 'bg-white text-black' : 'text-[#DBDEE1] hover:bg-[#35373C]'}`}>{isCameraOn ? <VideoOff size={24} /> : <Camera size={24} />}</button>
             <button onClick={toggleScreenShare} className={`p-3 rounded-xl transition-all ${isScreenSharing ? 'bg-[#23A559] text-white' : 'text-[#DBDEE1] hover:bg-[#35373C]'}`}><Monitor size={24} /></button>
           </div>
           <button onClick={() => handleEndCall(true)} className="w-14 h-14 bg-[#F23F42] hover:bg-[#D83C3E] rounded-2xl flex items-center justify-center text-white shadow-xl shadow-red-500/20 transition-all hover:scale-105 active:scale-95 ml-4"><PhoneOff size={28} /></button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
