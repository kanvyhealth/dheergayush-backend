(function (global) {
  'use strict';

  let client = null;
  let localTracks = [];
  let joined = false;
  let micEnabled = true;
  let camEnabled = true;
  let uiRefs = null;
  let autoplayResumeHandler = null;
  let layoutSwapped = false;
  let localPreviewHidden = false;

  const AUDIO_TRACK_CONFIG = {
    AEC: true,
    ANS: true,
    AGC: true,
    encoderConfig: 'speech_standard'
  };

  const VIDEO_TRACK_CONFIG = {
    encoderConfig: {
      width: 640,
      height: 480,
      frameRate: 24,
      bitrateMin: 300,
      bitrateMax: 1000
    },
    optimizationMode: 'motion'
  };

  function getMicTrack() {
    return localTracks.find((t) => t.trackMediaType === 'audio');
  }

  function getCamTrack() {
    return localTracks.find((t) => t.trackMediaType === 'video');
  }

  function ensureLayout(rootEl) {
    rootEl.innerHTML =
      '<div class="dg-agora-stage">' +
        '<div id="dg-agora-remote" class="dg-agora-remote"></div>' +
        '<div id="dg-agora-local" class="dg-agora-local dg-agora-local--mirror"></div>' +
        '<div id="dg-agora-autoplay" class="dg-agora-autoplay" hidden>' +
          '<p><i class="fa-solid fa-volume-high" aria-hidden="true"></i> Tap to hear the other participant</p>' +
          '<button type="button" id="dg-agora-resume-audio"><i class="fa-solid fa-play"></i> Enable sound</button>' +
        '</div>' +
        '<div class="dg-agora-toolbar">' +
          '<div class="dg-agora-toolbar-inner">' +
            '<div class="dg-agora-controls">' +
              '<button type="button" id="dg-agora-mic" class="dg-agora-ctrl" title="Microphone" aria-label="Toggle microphone">' +
                '<i class="fa-solid fa-microphone"></i>' +
              '</button>' +
              '<button type="button" id="dg-agora-cam" class="dg-agora-ctrl" title="Camera" aria-label="Toggle camera">' +
                '<i class="fa-solid fa-video"></i>' +
              '</button>' +
              '<button type="button" id="dg-agora-swap" class="dg-agora-ctrl" title="Swap video views" aria-label="Swap main and self video">' +
                '<i class="fa-solid fa-arrows-rotate"></i>' +
              '</button>' +
              '<button type="button" id="dg-agora-pip" class="dg-agora-ctrl" title="Show or hide self view" aria-label="Toggle self video preview">' +
                '<i class="fa-solid fa-user"></i>' +
              '</button>' +
            '</div>' +
            '<button type="button" id="dg-agora-leave" class="dg-agora-leave" aria-label="Leave call">' +
              '<i class="fa-solid fa-phone-slash"></i>' +
              '<span class="dg-agora-leave-text">End call</span>' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>';
    return {
      remote: document.getElementById('dg-agora-remote'),
      local: document.getElementById('dg-agora-local'),
      leaveBtn: document.getElementById('dg-agora-leave'),
      micBtn: document.getElementById('dg-agora-mic'),
      camBtn: document.getElementById('dg-agora-cam'),
      swapBtn: document.getElementById('dg-agora-swap'),
      pipBtn: document.getElementById('dg-agora-pip'),
      stage: document.querySelector('.dg-agora-stage'),
      autoplayBanner: document.getElementById('dg-agora-autoplay'),
      resumeAudioBtn: document.getElementById('dg-agora-resume-audio')
    };
  }

  function updateLayoutControlButtons() {
    if (!uiRefs) return;
    if (uiRefs.swapBtn) {
      uiRefs.swapBtn.classList.toggle('dg-agora-ctrl--active', layoutSwapped);
      uiRefs.swapBtn.setAttribute('aria-pressed', layoutSwapped ? 'true' : 'false');
    }
    if (uiRefs.pipBtn) {
      uiRefs.pipBtn.classList.toggle('dg-agora-ctrl--off', localPreviewHidden);
      uiRefs.pipBtn.setAttribute('aria-pressed', localPreviewHidden ? 'true' : 'false');
      const pipIcon = uiRefs.pipBtn.querySelector('i');
      if (pipIcon) {
        pipIcon.className = localPreviewHidden ? 'fa-solid fa-user-slash' : 'fa-solid fa-user';
      }
    }
    if (uiRefs.stage) {
      uiRefs.stage.classList.toggle('dg-agora-stage--swapped', layoutSwapped);
      uiRefs.stage.classList.toggle('dg-agora-stage--local-hidden', localPreviewHidden);
    }
  }

  function toggleLayoutSwap() {
    layoutSwapped = !layoutSwapped;
    updateLayoutControlButtons();
    return layoutSwapped;
  }

  function toggleLocalPreview() {
    localPreviewHidden = !localPreviewHidden;
    updateLayoutControlButtons();
    return localPreviewHidden;
  }

  function updateInCallControlButtons() {
    if (!uiRefs) return;
    if (uiRefs.micBtn) {
      uiRefs.micBtn.classList.toggle('dg-agora-ctrl--off', !micEnabled);
      const micIcon = uiRefs.micBtn.querySelector('i');
      if (micIcon) {
        micIcon.className = micEnabled ? 'fa-solid fa-microphone' : 'fa-solid fa-microphone-slash';
      }
    }
    if (uiRefs.camBtn) {
      uiRefs.camBtn.classList.toggle('dg-agora-ctrl--off', !camEnabled);
      const camIcon = uiRefs.camBtn.querySelector('i');
      if (camIcon) {
        camIcon.className = camEnabled ? 'fa-solid fa-video' : 'fa-solid fa-video-slash';
      }
    }
  }

  async function playRemoteMedia(user, mediaType, remoteEl) {
    if (!client || !user) return;
    try {
      await client.subscribe(user, mediaType);
      if (mediaType === 'video' && user.videoTrack && remoteEl) {
        user.videoTrack.play(remoteEl, { fit: 'cover' });
        const vid = remoteEl.querySelector('video');
        if (vid) {
          vid.setAttribute('playsinline', 'true');
          vid.setAttribute('webkit-playsinline', 'true');
        }
      }
      if (mediaType === 'audio' && user.audioTrack) {
        user.audioTrack.setVolume(100);
        await user.audioTrack.play();
        if (uiRefs && uiRefs.autoplayBanner) {
          uiRefs.autoplayBanner.hidden = true;
        }
      }
    } catch (err) {
      console.warn('Remote media play failed:', mediaType, err);
      if (mediaType === 'audio' && uiRefs && uiRefs.autoplayBanner) {
        uiRefs.autoplayBanner.hidden = false;
      }
    }
  }

  async function subscribeExistingRemoteUsers(remoteEl) {
    if (!client) return;
    const users = client.remoteUsers || [];
    for (const user of users) {
      if (user.hasVideo) await playRemoteMedia(user, 'video', remoteEl);
      if (user.hasAudio) await playRemoteMedia(user, 'audio', remoteEl);
    }
  }

  function setupAutoplayRecovery(onNeedGesture) {
    if (typeof AgoraRTC === 'undefined') return;

    AgoraRTC.onAutoplayFailed = () => {
      if (uiRefs && uiRefs.autoplayBanner) {
        uiRefs.autoplayBanner.hidden = false;
      }
      if (typeof onNeedGesture === 'function') onNeedGesture();
    };

    autoplayResumeHandler = async () => {
      if (!client) return;
      for (const user of client.remoteUsers || []) {
        if (user.audioTrack) {
          try {
            user.audioTrack.setVolume(100);
            await user.audioTrack.play();
          } catch (e) {
            console.warn('Resume remote audio failed:', e);
          }
        }
      }
      if (uiRefs && uiRefs.autoplayBanner) {
        uiRefs.autoplayBanner.hidden = true;
      }
    };
  }

  async function createLocalTracks(micOn, camOn) {
    micEnabled = micOn !== false;
    camEnabled = camOn !== false;
    localTracks = [];

    if (micEnabled && camEnabled) {
      localTracks = await AgoraRTC.createMicrophoneAndCameraTracks(
        AUDIO_TRACK_CONFIG,
        VIDEO_TRACK_CONFIG
      );
    } else if (micEnabled) {
      localTracks = [await AgoraRTC.createMicrophoneAudioTrack(AUDIO_TRACK_CONFIG)];
    } else if (camEnabled) {
      localTracks = [await AgoraRTC.createCameraVideoTrack(VIDEO_TRACK_CONFIG)];
    }

    const mic = getMicTrack();
    if (mic) await mic.setEnabled(micEnabled);
    const cam = getCamTrack();
    if (cam) await cam.setEnabled(camEnabled);

    return localTracks;
  }

  async function joinCall(options) {
    if (typeof AgoraRTC === 'undefined') {
      throw new Error('Agora Web SDK not loaded');
    }

    const rootEl = document.getElementById(options.containerId || 'root');
    if (!rootEl) throw new Error('Video container not found');

    await leaveCall();

    layoutSwapped = false;
    localPreviewHidden = false;
    uiRefs = ensureLayout(rootEl);
    updateInCallControlButtons();
    updateLayoutControlButtons();

    client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });

    if (typeof client.setAudioProfile === 'function') {
      try {
        await client.setAudioProfile('speech_standard');
      } catch (e) {
        console.warn('setAudioProfile:', e);
      }
    }

    client.on('user-published', async (user, mediaType) => {
      await playRemoteMedia(user, mediaType, uiRefs.remote);
      if (typeof options.onUserJoined === 'function') options.onUserJoined(user);
    });

    client.on('user-unpublished', (user, mediaType) => {
      if (mediaType === 'video' && user.videoTrack) {
        user.videoTrack.stop();
      }
      if (mediaType === 'audio' && user.audioTrack) {
        user.audioTrack.stop();
      }
    });

    client.on('user-left', () => {
      if (typeof options.onUserLeft === 'function') options.onUserLeft();
    });

    client.on('connection-state-change', (curState, revState, reason) => {
      if (typeof options.onConnectionStateChange === 'function') {
        options.onConnectionStateChange(curState, revState, reason);
      }
    });

    setupAutoplayRecovery(options.onAutoplayBlocked);

    if (uiRefs.resumeAudioBtn) {
      uiRefs.resumeAudioBtn.onclick = () => {
        if (autoplayResumeHandler) autoplayResumeHandler();
      };
    }

    await client.join(options.appId, options.channel, options.token, options.uid);

    await subscribeExistingRemoteUsers(uiRefs.remote);

    await createLocalTracks(
      options.microphoneEnabled !== false,
      options.cameraEnabled !== false
    );

    const videoTrack = getCamTrack();
    if (videoTrack) {
      videoTrack.play(uiRefs.local);
      const localVid = uiRefs.local && uiRefs.local.querySelector('video');
      if (localVid) {
        localVid.setAttribute('playsinline', 'true');
        localVid.setAttribute('webkit-playsinline', 'true');
        localVid.setAttribute('muted', 'true');
      }
    }
    if (localTracks.length) await client.publish(localTracks);
    joined = true;
    updateInCallControlButtons();

    uiRefs.micBtn.onclick = async () => {
      await setMicrophoneEnabled(!micEnabled);
      if (typeof options.onMicToggled === 'function') options.onMicToggled(micEnabled);
    };

    uiRefs.camBtn.onclick = async () => {
      await setCameraEnabled(!camEnabled);
      if (typeof options.onCameraToggled === 'function') options.onCameraToggled(camEnabled);
    };

    uiRefs.leaveBtn.onclick = () => leaveCall().then(() => {
      if (typeof options.onLeave === 'function') options.onLeave();
    });

    if (uiRefs.swapBtn) {
      uiRefs.swapBtn.onclick = () => {
        toggleLayoutSwap();
        if (typeof options.onLayoutSwapped === 'function') options.onLayoutSwapped(layoutSwapped);
      };
    }

    if (uiRefs.pipBtn) {
      uiRefs.pipBtn.onclick = () => {
        toggleLocalPreview();
        if (typeof options.onLocalPreviewToggled === 'function') options.onLocalPreviewToggled(localPreviewHidden);
      };
    }

    if (typeof options.onConnected === 'function') options.onConnected();
    return client;
  }

  async function setMicrophoneEnabled(enabled) {
    micEnabled = !!enabled;
    const mic = getMicTrack();
    if (mic) {
      await mic.setEnabled(micEnabled);
    } else if (micEnabled && client && joined) {
      const track = await AgoraRTC.createMicrophoneAudioTrack(AUDIO_TRACK_CONFIG);
      localTracks.push(track);
      await client.publish([track]);
    }
    updateInCallControlButtons();
    return micEnabled;
  }

  async function setCameraEnabled(enabled) {
    camEnabled = !!enabled;
    const cam = getCamTrack();
    if (cam) {
      await cam.setEnabled(camEnabled);
    } else if (camEnabled && client && joined) {
      const track = await AgoraRTC.createCameraVideoTrack(VIDEO_TRACK_CONFIG);
      localTracks.push(track);
      track.play(uiRefs.local);
      await client.publish([track]);
    }
    updateInCallControlButtons();
    return camEnabled;
  }

  async function leaveCall() {
    joined = false;
    micEnabled = true;
    camEnabled = true;
    layoutSwapped = false;
    localPreviewHidden = false;

    localTracks.forEach((track) => {
      track.stop();
      track.close();
    });
    localTracks = [];

    if (client) {
      await client.unpublish().catch(() => {});
      await client.leave().catch(() => {});
      client.removeAllListeners();
      client = null;
    }

    uiRefs = null;
    autoplayResumeHandler = null;
  }

  global.DgAgoraCall = {
    joinCall,
    leaveCall,
    setMicrophoneEnabled,
    setCameraEnabled,
    toggleLayoutSwap,
    toggleLocalPreview,
    isMicrophoneEnabled: () => micEnabled,
    isCameraEnabled: () => camEnabled,
    isLayoutSwapped: () => layoutSwapped,
    isLocalPreviewHidden: () => localPreviewHidden,
    getClient: () => client,
    isJoined: () => joined
  };
})(window);
