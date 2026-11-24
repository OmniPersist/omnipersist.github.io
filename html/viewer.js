'use strict';
(() => {
  const allVideos = [...document.querySelectorAll('video')];
  const pauseOthers = (card) => {
    allVideos.forEach(video => {
      if (video.closest('.result-card') !== card) video.pause();
    });
  };
  allVideos.forEach(video => {
    video.muted = true;
    video.addEventListener('play', () => pauseOthers(video.closest('.result-card')));
    video.addEventListener('error', () => {
      const message = video.closest('.result-card').querySelector('.media-error');
      message.textContent = 'This video could not be loaded. Keep index.html beside the html folder and open it in a browser with H.264 video support.';
      message.hidden = false;
    });
  });

  document.querySelectorAll('.comparison-card').forEach(card => {
    const video = card.querySelector('video');
    const controls = card.querySelector('.comparison-controls');
    const speed = controls.querySelector('.speed');
    speed.addEventListener('change', () => {
      video.playbackRate = Number(speed.value);
    });
    video.addEventListener('ratechange', () => {
      speed.value = String(video.playbackRate);
    });
    controls.hidden = false;
  });

  document.querySelectorAll('[data-pair]').forEach(card => {
    const [perspective, panorama] = card.querySelectorAll('video');
    const controls = card.querySelector('.pair-controls');
    const playButton = card.querySelector('.play-toggle');
    const slider = card.querySelector('.timeline');
    const time = card.querySelector('.time');
    const speed = card.querySelector('.speed');
    const error = card.querySelector('.media-error');
    let animation = 0;
    let pendingSeek = null;
    let revision = 0;
    let buffering = false;
    let starting = false;
    // The final sample is at 5 s; container duration also includes its display interval.
    const duration = () => Math.min(5, Number.isFinite(perspective.duration) ? perspective.duration : 5);
    const position = () => Math.max(0, Math.min(perspective.currentTime, duration()));
    const seekPanorama = t => {
      if (panorama.readyState > 0) panorama.currentTime = Math.max(0, Math.min(t, duration(), panorama.duration - 0.001));
    };
    const render = () => {
      slider.max = duration();
      slider.value = position();
      slider.setAttribute('aria-valuetext', position().toFixed(2) + ' seconds');
      time.textContent = position().toFixed(2) + ' / ' + duration().toFixed(2) + ' s';
    };
    const stop = () => {
      revision++;
      starting = false;
      perspective.pause();
      panorama.pause();
      buffering = false;
      cancelAnimationFrame(animation);
      playButton.textContent = 'Play pair';
      playButton.setAttribute('aria-pressed', 'false');
      render();
    };
    const finishAtBoundary = () => {
      if (perspective.currentTime < duration()) return false;
      stop();
      if (perspective.currentTime !== duration()) perspective.currentTime = duration();
      seekPanorama(duration());
      render();
      return true;
    };
    const tick = () => {
      if (finishAtBoundary()) return;
      render();
      // Match absolute timestamps, rather than stretching the two unequal durations.
      // The panoramic stream contains 21 samples at 4 fps; perspective has 81 at 16 fps.
      if (!perspective.paused && !buffering && panorama.readyState >= 2 && Math.abs(panorama.currentTime - perspective.currentTime) > 0.27) {
        seekPanorama(perspective.currentTime);
      }
      if (!perspective.paused) animation = requestAnimationFrame(tick);
    };
    const play = async () => {
      const request = ++revision;
      starting = true;
      playButton.textContent = 'Loading…';
      playButton.setAttribute('aria-pressed', 'true');
      error.hidden = true;
      if (perspective.ended || perspective.currentTime >= duration() - 0.02) {
        perspective.currentTime = 0;
      }
      seekPanorama(perspective.currentTime);
      try {
        await Promise.all([perspective.play(), panorama.play()]);
        if (request !== revision) return;
        starting = false;
        buffering = false;
        playButton.textContent = 'Pause pair';
        playButton.setAttribute('aria-pressed', 'true');
        cancelAnimationFrame(animation);
        animation = requestAnimationFrame(tick);
      } catch (failure) {
        if (request !== revision) return;
        stop();
        error.textContent = 'Playback did not start. Try Play pair again, or open a video in full screen.';
        error.hidden = false;
      }
    };
    playButton.addEventListener('click', () => starting || !perspective.paused ? stop() : play());
    card.querySelector('.restart').addEventListener('click', () => {
      stop();
      if (perspective.readyState > 0) perspective.currentTime = 0;
      else pendingSeek = 0;
      seekPanorama(0);
      render();
      play();
    });
    slider.addEventListener('input', () => {
      const target = Math.max(0, Math.min(Number(slider.value), duration()));
      if (perspective.readyState > 0) perspective.currentTime = target;
      else { pendingSeek = target; perspective.preload = 'auto'; perspective.load(); }
      if (panorama.readyState === 0) { panorama.preload = 'auto'; panorama.load(); }
      seekPanorama(target);
      time.textContent = target.toFixed(2) + ' / ' + duration().toFixed(2) + ' s';
      slider.setAttribute('aria-valuetext', target.toFixed(2) + ' seconds');
    });
    speed.addEventListener('change', () => {
      perspective.playbackRate = panorama.playbackRate = Number(speed.value);
    });
    perspective.addEventListener('loadedmetadata', () => {
      if (pendingSeek !== null) { perspective.currentTime = pendingSeek; pendingSeek = null; }
      render();
    });
    panorama.addEventListener('loadedmetadata', () => seekPanorama(pendingSeek === null ? perspective.currentTime : pendingSeek));
    perspective.addEventListener('seeked', () => { seekPanorama(perspective.currentTime); render(); });
    perspective.addEventListener('timeupdate', () => {
      if (!finishAtBoundary()) render();
    });
    perspective.addEventListener('ended', stop);
    perspective.addEventListener('pause', () => {
      if (starting) { stop(); return; }
      panorama.pause();
      cancelAnimationFrame(animation);
      playButton.textContent = 'Play pair';
      playButton.setAttribute('aria-pressed', 'false');
    });
    perspective.addEventListener('waiting', () => {
      buffering = true;
      // play() remains pending while media loads. Pausing the panorama here
      // would reject its initial play promise with AbortError.
      if (!starting) panorama.pause();
    });
    perspective.addEventListener('playing', () => {
      buffering = false;
      if (!starting) {
        seekPanorama(perspective.currentTime);
        panorama.play().catch(() => {});
      }
    });
    card.querySelectorAll('.fullscreen').forEach(button => {
      const video = button.closest('figure').querySelector('video');
      button.addEventListener('click', async () => {
        try {
          if (video.requestFullscreen) await video.requestFullscreen();
          else if (video.webkitEnterFullscreen) video.webkitEnterFullscreen();
          else throw new Error('Fullscreen unavailable');
        } catch (_) {
          error.textContent = 'Full screen is unavailable in this browser. You can enlarge the page using browser zoom.';
          error.hidden = false;
        }
      });
    });
    // Native controls remain available if JavaScript is disabled.
    perspective.controls = panorama.controls = false;
    controls.hidden = false;
    playButton.setAttribute('aria-pressed', 'false');
  });

  // Stop decoding off-screen examples; do not autoplay or issue network requests.
  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) entry.target.querySelectorAll('video').forEach(v => v.pause());
      });
    }, { rootMargin: '150px' });
    document.querySelectorAll('.result-card').forEach(card => observer.observe(card));
    const navLinks = [...document.querySelectorAll('.nav-links a')];
    const sections = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          navLinks.forEach(link => {
            if (link.hash === '#' + entry.target.id) link.setAttribute('aria-current', 'location');
            else link.removeAttribute('aria-current');
          });
        }
      });
    }, { rootMargin: '-12% 0px -65% 0px', threshold: 0 });
    document.querySelectorAll('main > section').forEach(section => sections.observe(section));
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) allVideos.forEach(video => video.pause());
  });
})();
