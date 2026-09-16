(() => {
  'use strict';
  try {
    const media = JSON.parse(document.getElementById('media-data').textContent);
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let motionEnabled = !reducedMotion.matches;
    const motionButton = document.getElementById('motion-toggle');
    const dialog = document.getElementById('zoom-dialog');
    const visibleVideos = new Set();
    const setPlayback = video => {
      const inEnlargedView = dialog.contains(video);
      const canPlay = !document.hidden && motionEnabled &&
        (inEnlargedView || (visibleVideos.has(video) && !dialog.open));
      if (canPlay) {
        const playing = video.play();
        if (playing && playing.catch) playing.catch(() => { video.controls = true; });
      } else video.pause();
    };
    const videoObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) visibleVideos.add(entry.target);
        else visibleVideos.delete(entry.target);
        setPlayback(entry.target);
      });
    }, { threshold: 0.08 });
    document.querySelectorAll('[data-media]').forEach(element => {
      const asset = media[element.dataset.media];
      if (!asset) return;
      element.addEventListener('error', () => {
        if (element.dataset.loadError) return;
        element.dataset.loadError = 'true';
        const message = document.createElement('p');
        message.className = 'media-error';
        message.textContent = `${asset.alt} could not load. Reload this page to try again.`;
        message.setAttribute('role', 'status');
        element.parentElement.append(message);
      }, { once: true });
      element.src = asset.src;
      if (element.tagName === 'VIDEO') {
        element.muted = true;
        if (asset.poster) element.poster = asset.poster;
        videoObserver.observe(element);
      }
    });
    const updateMotion = () => {
      motionButton.setAttribute('aria-pressed', String(motionEnabled));
      motionButton.textContent = motionEnabled ? 'Motion on' : 'Motion paused';
      document.querySelectorAll('video').forEach(setPlayback);
      document.querySelectorAll('img[data-media]').forEach(element => {
        const asset = media[element.dataset.media];
        if (asset && asset.poster) element.src = motionEnabled ? asset.src : asset.poster;
      });
    };
    motionButton.addEventListener('click', () => { motionEnabled = !motionEnabled; updateMotion(); });
    reducedMotion.addEventListener('change', event => { motionEnabled = !event.matches; updateMotion(); });
    document.addEventListener('visibilitychange', () => {
      document.querySelectorAll('video').forEach(setPlayback);
    });
    updateMotion();
    document.getElementById('annotation-toggle').addEventListener('click', event => {
      const hidden = document.body.classList.toggle('annotations-hidden');
      event.currentTarget.setAttribute('aria-pressed', String(!hidden));
      event.currentTarget.textContent = hidden ? 'Annotations off' : 'Annotations on';
    });
    document.querySelectorAll('.media-card').forEach(card => {
      card.querySelectorAll('[data-pin],[data-legend]').forEach(button => {
        button.addEventListener('click', () => {
          const number = button.dataset.pin || button.dataset.legend;
          card.querySelectorAll('[data-callout]').forEach(callout => {
            callout.classList.toggle('selected', callout.dataset.callout === number);
          });
          card.querySelectorAll('[data-pin],[data-legend]').forEach(item => {
            const selected = (item.dataset.pin || item.dataset.legend) === number;
            item.classList.toggle('selected', selected);
            item.setAttribute('aria-pressed', String(selected));
          });
        });
      });
    });
    const navigationLinks = Array.from(document.querySelectorAll('nav a'));
    const sections = Array.from(document.querySelectorAll('main>section'));
    let scrollScheduled = false;
    const updateNavigation = () => {
      scrollScheduled = false;
      let current = sections[0].id;
      for (const section of sections) {
        if (section.getBoundingClientRect().top <= 165) current = section.id;
      }
      navigationLinks.forEach(link => {
        const active = link.hash === `#${current}`;
        link.classList.toggle('active', active);
        if (active) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      });
    };
    window.addEventListener('scroll', () => {
      if (!scrollScheduled) { scrollScheduled = true; requestAnimationFrame(updateNavigation); }
    }, { passive: true });
    updateNavigation();
    const zoomContent = document.getElementById('zoom-content');
    let priorFocus;
    document.querySelectorAll('[data-zoom]').forEach(button => {
      button.addEventListener('click', () => {
        const asset = media[button.dataset.zoom];
        if (!asset) return;
        priorFocus = button;
        zoomContent.replaceChildren();
        const element = document.createElement(asset.kind === 'video' ? 'video' : 'img');
        element.src = asset.kind === 'image' && !motionEnabled && asset.poster ? asset.poster : asset.src;
        if (asset.kind === 'image') element.alt = asset.alt;
        else element.setAttribute('aria-label', asset.alt);
        if (asset.kind === 'video') {
          element.controls = true;
          element.muted = true;
          element.loop = true;
          element.playsInline = true;
          element.preload = 'metadata';
          if (asset.poster) element.poster = asset.poster;
        }
        zoomContent.append(element);
        document.getElementById('zoom-title').textContent = asset.alt;
        document.querySelectorAll('main video').forEach(video => video.pause());
        dialog.showModal();
        document.body.style.overflow = 'hidden';
        if (asset.kind === 'video') setPlayback(element);
      });
    });
    document.getElementById('zoom-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    dialog.addEventListener('close', () => {
      zoomContent.querySelectorAll('video').forEach(video => video.pause());
      zoomContent.replaceChildren();
      document.body.style.overflow = '';
      visibleVideos.forEach(setPlayback);
      if (priorFocus) priorFocus.focus({ preventScroll: true });
    });
  } catch (error) {
    console.error('The showcase could not initialize:', error);
    const message = document.createElement('p');
    message.className = 'load-message';
    message.textContent = 'The showcase could not load completely. Reload this page to try again.';
    message.setAttribute('role', 'alert');
    document.querySelector('main').prepend(message);
  }
})();
