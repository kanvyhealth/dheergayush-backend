/**
 * Legacy entry — redirects to Agora video call page.
 * Tokens are issued only via POST /api/agora/token on video-call.html.
 */
(function () {
  var params = new URLSearchParams(window.location.search);
  var roomID = params.get('roomID') || localStorage.getItem('videoRoomId') || localStorage.getItem('zegoRoomId') || '';
  if (roomID && !localStorage.getItem('videoRoomId')) {
    localStorage.setItem('videoRoomId', roomID);
  }
  var target = '/video-call.html';
  if (window.location.search) target += window.location.search;
  window.location.replace(target);
})();
