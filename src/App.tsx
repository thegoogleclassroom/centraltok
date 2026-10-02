/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { AppProvider, useAppStore } from './store';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Explore } from './pages/Explore';
import { Upload } from './pages/Upload';
import { Profile } from './pages/Profile';
import { Inbox } from './pages/Inbox';
import { Chat } from './pages/Chat';
import { BanScreen } from './components/BanScreen';
import { InterestsModal } from './components/InterestsModal';
import { MiniPlayer } from './components/MiniPlayer';
import { GlobalStoryViewer } from './components/StoriesBar';
import { CallOverlay } from './components/CallOverlay';
import { Admin } from './pages/Admin';
import { Forum } from './pages/Forum';
import { UpdatesAnnouncements } from './pages/UpdatesAnnouncements';
import { SneakPeeks } from './pages/SneakPeeks';
import { GamesApps } from './pages/GamesApps';

import { BookmarkBanner } from './components/BookmarkBanner';

function AuthWrapper({ children }: { children: React.ReactNode }) {
  const { currentUser } = useAppStore();
  
  if (currentUser?.banStatus) {
    const isTemp = currentUser.banStatus.type === 'temp';
    if (!isTemp || (isTemp && currentUser.banStatus.until && Date.now() < currentUser.banStatus.until)) {
      return <BanScreen />;
    }
  }
  
  return (
    <>
      <BookmarkBanner />
      {children}
      <InterestsModal />
      <GlobalStoryViewer />
      <CallOverlay />
    </>
  );
}

export default function App() {
  return (
    <AppProvider>
      <HashRouter>
        <AuthWrapper>
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/videos/:videoId" element={<Home />} />
              <Route path="/video/:videoId" element={<Home />} />
              <Route path="/explore" element={<Explore />} />
              <Route path="/upload" element={<Upload />} />
              <Route path="/@:handle" element={<Profile />} />
              <Route path="/profile/:handle" element={<Profile />} />
              <Route path="/messages" element={<Inbox />} />
              <Route path="/messages/:handle" element={<Chat />} />
              <Route path="/messages/group/:groupId" element={<Chat />} />
              <Route path="/forum" element={<Forum />} />
              <Route path="/forum/updates" element={<UpdatesAnnouncements />} />
              <Route path="/forum/announcements" element={<UpdatesAnnouncements />} />
              <Route path="/forum/sneak-peeks" element={<SneakPeeks />} />
              <Route path="/forum/sneak-peaks" element={<SneakPeeks />} />
              <Route path="/sneak-peeks" element={<SneakPeeks />} />
              <Route path="/games-apps" element={<GamesApps />} />
              <Route path="/admin" element={<Admin />} />
            </Routes>
          </Layout>
        </AuthWrapper>
      </HashRouter>
    </AppProvider>
  );
}
