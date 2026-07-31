var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// .wrangler/tmp/bundle-TDwAxA/checked-fetch.js
var urls = /* @__PURE__ */ new Set();
function checkURL(request, init) {
  const url = request instanceof URL ? request : new URL(
    (typeof request === "string" ? new Request(request, init) : request).url
  );
  if (url.port && url.port !== "443" && url.protocol === "https:") {
    if (!urls.has(url.toString())) {
      urls.add(url.toString());
      console.warn(
        `WARNING: known issue with \`fetch()\` requests to custom HTTPS ports in published Workers:
 - ${url.toString()} - the custom port will be ignored when the Worker is published using the \`wrangler deploy\` command.
`
      );
    }
  }
}
__name(checkURL, "checkURL");
globalThis.fetch = new Proxy(globalThis.fetch, {
  apply(target, thisArg, argArray) {
    const [request, init] = argArray;
    checkURL(request, init);
    return Reflect.apply(target, thisArg, argArray);
  }
});

// worker.js
var ADMIN_PASSWORD = "m1m1";
var FALLBACK_HERO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 400" width="100%" height="100%">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b5ed7" />
      <stop offset="100%" stop-color="#051c42" />
    </linearGradient>
    <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
      <path d="M 40 0 L 0 0 0 40" fill="none" stroke="rgba(255,255,255,0.07)" stroke-width="1"/>
    </pattern>
  </defs>
  <rect width="100%" height="100%" fill="url(#g)" />
  <rect width="100%" height="100%" fill="url(#grid)" />
  <circle cx="200" cy="200" r="150" fill="rgba(255,255,255,0.03)" />
  <circle cx="1000" cy="150" r="120" fill="rgba(255,255,255,0.02)" />

  <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="52" font-weight="900" fill="#ffffff" letter-spacing="1.5">
    MOTHOTSI SECURITY STEEL
  </text>
  <text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle" font-family="system-ui, -apple-system, sans-serif" font-size="22" font-weight="500" fill="#cbd5e1" letter-spacing="1">
    Premium Steel &amp; Aluminium Fabrication \u2022 Gate &amp; Garage Automation
  </text>

  <path d="M 0 350 Q 300 300 600 350 T 1200 350 L 1200 400 L 0 400 Z" fill="rgba(255,255,255,0.05)" />
</svg>`;
var worker_default = {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/header/mothotsi.jpg" || path === "/mothotsi.jpg") {
      return new Response(FALLBACK_HERO_SVG, {
        headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" }
      });
    }
    if (path === "/" || path === "/index.html") {
      return new Response(indexHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }
    if (path === "/admin" || path === "/admin.html") {
      return new Response(adminHtml, {
        headers: { "Content-Type": "text/html; charset=utf-8" }
      });
    }
    if (path === "/gallery" || path === "/gallery.html") {
      return await handleGallerySSR(env);
    }
    if (path.startsWith("/image/")) {
      const imgId = path.substring(7);
      if (!imgId) {
        return new Response("Missing Image ID", { status: 400 });
      }
      const imgData = await env.FIRE_KV.get(`img:${imgId}`, { type: "arrayBuffer" });
      if (!imgData) {
        return new Response(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 200" width="300" height="200" style="background:#f1f5f9;"><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#64748b" font-family="sans-serif">Image Not Found</text></svg>`, {
          headers: { "Content-Type": "image/svg+xml" },
          status: 404
        });
      }
      const metadata = await env.FIRE_KV.get(`meta:${imgId}`, { type: "json" });
      const contentType = metadata && metadata.contentType || "image/jpeg";
      return new Response(imgData, {
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "public, max-age=604800, immutable"
        }
      });
    }
    if (path === "/api/images") {
      const authHeader = request.headers.get("Authorization");
      const images = await getImageList(env);
      return new Response(JSON.stringify(images), {
        headers: { "Content-Type": "application/json" }
      });
    }
    if (path === "/api/upload" && request.method === "POST") {
      const authorized = checkAuth(request);
      if (!authorized) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      try {
        const formData = await request.formData();
        const file = formData.get("file");
        const title = formData.get("title") || "Untitled Project";
        if (!file || !(file instanceof File)) {
          return new Response(JSON.stringify({ error: "No image file provided" }), { status: 400 });
        }
        const id = crypto.randomUUID();
        const arrayBuffer = await file.arrayBuffer();
        const contentType = file.type || "image/jpeg";
        await env.FIRE_KV.put(`img:${id}`, arrayBuffer);
        const imageList = await getImageList(env);
        const newImage = {
          id,
          title: String(title),
          contentType,
          uploadedAt: Date.now()
        };
        imageList.unshift(newImage);
        await env.FIRE_KV.put("gallery_images_index", JSON.stringify(imageList));
        await env.FIRE_KV.put(`meta:${id}`, JSON.stringify(newImage));
        return new Response(JSON.stringify({ success: true, image: newImage }), {
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
    if (path === "/api/edit" && request.method === "POST") {
      const authorized = checkAuth(request);
      if (!authorized) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      try {
        const { id, title } = await request.json();
        if (!id || !title) {
          return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
        }
        const imageList = await getImageList(env);
        const imgIndex = imageList.findIndex((img) => img.id === id);
        if (imgIndex === -1) {
          return new Response(JSON.stringify({ error: "Image not found" }), { status: 404 });
        }
        imageList[imgIndex].title = title;
        await env.FIRE_KV.put("gallery_images_index", JSON.stringify(imageList));
        const individualMeta = await env.FIRE_KV.get(`meta:${id}`, { type: "json" }) || {};
        individualMeta.title = title;
        await env.FIRE_KV.put(`meta:${id}`, JSON.stringify(individualMeta));
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
    if (path === "/api/delete" && request.method === "POST") {
      const authorized = checkAuth(request);
      if (!authorized) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
      }
      try {
        const { id } = await request.json();
        if (!id) {
          return new Response(JSON.stringify({ error: "Missing ID" }), { status: 400 });
        }
        let imageList = await getImageList(env);
        imageList = imageList.filter((img) => img.id !== id);
        await env.FIRE_KV.put("gallery_images_index", JSON.stringify(imageList));
        await env.FIRE_KV.delete(`img:${id}`);
        await env.FIRE_KV.delete(`meta:${id}`);
        return new Response(JSON.stringify({ success: true }), { headers: { "Content-Type": "application/json" } });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { "Content-Type": "application/json" } });
      }
    }
    return new Response("Not Found", { status: 404 });
  }
};
function checkAuth(request) {
  const authHeader = request.headers.get("Authorization");
  return authHeader === ADMIN_PASSWORD;
}
__name(checkAuth, "checkAuth");
async function getImageList(env) {
  const index = await env.FIRE_KV.get("gallery_images_index", { type: "json" });
  return index || [];
}
__name(getImageList, "getImageList");
async function handleGallerySSR(env) {
  const images = await getImageList(env);
  let galleryTilesHtml = "";
  if (images.length === 0) {
    galleryTilesHtml = `<div style="grid-column: 1 / -1; text-align: center; color: #64748b; padding: 40px 0;">
      <h3>No images have been uploaded to the gallery yet.</h3>
      <p>Check back later or contact admin to upload project pictures!</p>
    </div>`;
  } else {
    images.forEach((img) => {
      galleryTilesHtml += `
      <div class="tile">
        <img src="/image/${img.id}" alt="${escapeHtml(img.title)}" />
        <p>${escapeHtml(img.title)}</p>
      </div>`;
    });
  }
  const renderedHtml = galleryTemplate.replace(
    `<div class="gallery">
      <div class="tile"><img src="header/mothotsi.jpg" alt="Project 1" /><p>Project 1</p></div>
      <div class="tile"><img src="header/mothotsi.jpg" alt="Project 2" /><p>Project 2</p></div>
      <div class="tile"><img src="header/mothotsi.jpg" alt="Project 3" /><p>Project 3</p></div>
    </div>`,
    `<div class="gallery">${galleryTilesHtml}</div>`
  );
  return new Response(renderedHtml, {
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}
__name(handleGallerySSR, "handleGallerySSR");
function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}
__name(escapeHtml, "escapeHtml");
var indexHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Mothotsi Security Steel</title>
  <meta name="description" content="Mothotsi Security Steel specializes in steel and aluminium fabrication, gate and garage door installation, gate motors, and steel staircase solutions." />
  <style>
    :root {
      --primary: #0b5ed7;
      --secondary: #3b82f6;
      --accent: #f8fbff;
      --text: #1e293b;
      --muted: #1d4ed8;
      --success: #22c55e;
      --deep: #0f172a;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--text);
      line-height: 1.6;
      background: linear-gradient(180deg, #054ba7 0%, #eef6ff 100%);
    }

    header {
      margin: 0;
      padding: 0;
    }

    .site-header {
      position: relative;
    }

    .menu-toggle {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 3;
      display: flex;
      flex-direction: column;
      gap: 5px;
      padding: 10px;
      border: none;
      border-radius: 10px;
      background: rgba(255,255,255,0.96);
      box-shadow: 0 6px 18px rgba(0, 0, 0, 0.16);
      cursor: pointer;
    }

    .menu-toggle span {
      display: block;
      width: 22px;
      height: 2px;
      background: var(--primary);
      border-radius: 2px;
      transition: 0.25s ease;
    }

    .menu-toggle.active span:nth-child(1) {
      transform: translateY(7px) rotate(45deg);
    }

    .menu-toggle.active span:nth-child(2) {
      opacity: 0;
    }

    .menu-toggle.active span:nth-child(3) {
      transform: translateY(-7px) rotate(-45deg);
    }

    .menu-panel {
      position: absolute;
      top: 58px;
      right: 16px;
      z-index: 4;
      display: none;
      flex-direction: column;
      min-width: 170px;
      padding: 10px;
      border-radius: 12px;
      background: white;
      box-shadow: 0 12px 30px rgba(0, 0, 0, 0.15);
    }

    .menu-panel.open {
      display: flex;
    }

    .menu-panel a {
      padding: 10px 12px;
      border-radius: 8px;
      color: var(--deep);
      text-decoration: none;
      font-weight: 600;
    }

    .menu-panel a:hover {
      background: #eef6ff;
      color: var(--primary);
    }

    header img {
      width: 100%;
      height: auto;
      display: block;
      object-fit: cover;
      max-height: 150px;
    }

    .container { max-width: 1100px; margin: 0 auto; padding: 0 20px; }

    .card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(11, 94, 215, 0.12);
      padding: 30px;
      margin-top: -30px;
      position: relative;
      z-index: 2;
    }

    .section { padding: 40px 0; }
    .section h2 { color: var(--primary); margin-bottom: 15px; }

    .services {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }

    .service {
      background: linear-gradient(135deg, #ffffff, #f0f7ff);
      border-left: 4px solid var(--secondary);
      padding: 20px;
      border-radius: 12px;
    }

    .service h3 { margin-top: 0; color: var(--primary); }

    .cta {
      text-align: center;
      background: linear-gradient(135deg, #0b5ed7, #60a5fa);
      color: white;
      padding: 30px;
      border-radius: 16px;
      margin: 30px 0;
    }

    .cta a {
      display: inline-block;
      margin-top: 10px;
      background: white;
      color: var(--primary);
      text-decoration: none;
      padding: 12px 20px;
      border-radius: 999px;
      font-weight: bold;
    }

    .contact-list {
      display: flex;
      flex-wrap: wrap;
      justify-content: center;
      gap: 12px;
      margin-top: 14px;
    }

    .contact-list a {
      background: rgba(255,255,255,0.16);
      color: white;
      border: 1px solid rgba(255,255,255,0.25);
      padding: 10px 14px;
      border-radius: 999px;
      text-decoration: none;
      font-weight: 600;
      display: inline-flex;
      align-items: center;
      gap: 8px;
    }

    .contact-list a.whatsapp {
      background: var(--success);
      color: white;
      border-color: var(--success);
    }

    .contact-list .icon {
      font-size: 1.1rem;
      line-height: 1;
    }

    footer {
      text-align: center;
      padding: 25px 20px 50px;
      color: var(--muted);
      font-size: 0.95rem;
    }

    @media (max-width: 700px) {
      header h1 { font-size: 1.8rem; }
      .card { padding: 22px; }
    }
  </style>
</head>
<body>
  <header class="site-header">
    <button class="menu-toggle" id="menuToggle" aria-label="Open menu" aria-expanded="false">
      <span></span>
      <span></span>
      <span></span>
    </button>
    <nav class="menu-panel" id="menuPanel" aria-label="Page navigation">
      <a href="#about">About</a>
      <a href="#services">Services</a>
      <a href="gallery.html">Gallery</a>
      <a href="#contact">Contact</a>
    </nav>
    <img src="header/mothotsi.jpg" alt="Mothotsi Security Steel" />
  </header>

  <main class="container">
    <section class="card" id="about">
      <h2>About Us</h2>
      <p>At <strong>Mothotsi Security Steel</strong>, we specialize in the design, fabrication, and installation of durable steel and aluminium products. We provide reliable security and access solutions for gates, garage doors, and motorized systems, with a strong focus on quality workmanship and customer satisfaction.</p>
    </section>

    <section class="section" id="services">
      <h2>Our Services</h2>
      <div class="services">
        <div class="service">
          <h3>Steel & Aluminium Fabrication</h3>
          <p>Custom fabrication of steel and aluminium structures built to last.</p>
        </div>
        <div class="service">
          <h3>Gate Installation</h3>
          <p>We create and install strong, secure gates for residential and commercial properties.</p>
        </div>
        <div class="service">
          <h3>Gate Motors & Garage Door Motors</h3>
          <p>Professional installation and maintenance of gate motors and garage door motors.</p>
        </div>
        <div class="service">
          <h3>Garage Doors & Access Systems</h3>
          <p>Reliable garage doors and automated access solutions for everyday convenience.</p>
        </div>
        <div class="service">
          <h3>Steel Staircases</h3>
          <p>Stylish and durable steel staircases tailored to your space and needs.</p>
        </div>
      </div>
    </section>

    <!-- Gallery moved to a separate page: gallery.html -->

    <section class="cta" id="contact">
      <h2>Need a secure and durable solution?</h2>
      <p>Contact us today for expert steel, aluminium, gate, and garage door services.</p>
      <div class="contact-list">
        <a href="tel:+2646228454">Call: 064 622 8454</a>
        <a class="whatsapp" href="https://wa.me/2646228454" target="_blank" rel="noopener noreferrer"><span class="icon">\u{1F4AC}</span> WhatsApp: 064 622 8454</a>
        <a href="https://www.facebook.com" target="_blank" rel="noopener noreferrer">Facebook: Mothotsi Security Steel</a>
      </div>
    </section>
  </main>

  <footer>
    <p>\xA9 2026 Mothotsi Security Steel. All rights reserved.</p>
  </footer>

  <script>
    const menuToggle = document.getElementById('menuToggle');
    const menuPanel = document.getElementById('menuPanel');

    if (menuToggle && menuPanel) {
      menuToggle.addEventListener('click', () => {
        const isOpen = menuPanel.classList.toggle('open');
        menuToggle.classList.toggle('active', isOpen);
        menuToggle.setAttribute('aria-expanded', String(isOpen));
      });

      menuPanel.querySelectorAll('a').forEach((link) => {
        link.addEventListener('click', () => {
          menuPanel.classList.remove('open');
          menuToggle.classList.remove('active');
          menuToggle.setAttribute('aria-expanded', 'false');
        });
      });
    }
  <\/script>
</body>
</html>
 `;
var adminHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Admin Panel - Mothotsi Security Steel</title>
  <style>
    :root {
      --primary: #0b5ed7;
      --secondary: #3b82f6;
      --accent: #f8fbff;
      --text: #1e293b;
      --muted: #64748b;
      --success: #22c55e;
      --danger: #ef4444;
      --deep: #0f172a;
    }

    * { box-sizing: border-box; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: var(--text);
      line-height: 1.6;
      background: linear-gradient(180deg, #054ba7 0%, #eef6ff 100%);
      min-height: 100vh;
      padding: 20px;
    }

    .container {
      max-width: 900px;
      margin: 0 auto;
    }

    .card {
      background: white;
      border-radius: 16px;
      box-shadow: 0 10px 30px rgba(11, 94, 215, 0.15);
      padding: 30px;
      margin-bottom: 20px;
    }

    h1, h2, h3 {
      color: var(--deep);
      margin-top: 0;
    }

    .admin-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 20px;
      flex-wrap: wrap;
      gap: 12px;
    }

    .btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      padding: 10px 16px;
      border: none;
      border-radius: 8px;
      font-weight: bold;
      cursor: pointer;
      text-decoration: none;
      font-size: 0.95rem;
      transition: all 0.2s;
    }

    .btn-primary { background: var(--primary); color: white; }
    .btn-primary:hover { background: #0a53be; }
    .btn-danger { background: var(--danger); color: white; }
    .btn-danger:hover { background: #dc3545; }
    .btn-secondary { background: #e2e8f0; color: var(--text); }
    .btn-secondary:hover { background: #cbd5e1; }
    .btn-success { background: var(--success); color: white; }
    .btn-success:hover { background: #16a34a; }

    /* Login Form Styles */
    .login-container {
      max-width: 400px;
      margin: 100px auto 0;
    }

    .form-group {
      margin-bottom: 16px;
    }

    .form-group label {
      display: block;
      margin-bottom: 6px;
      font-weight: 600;
      color: var(--text);
    }

    .form-control {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      font-size: 1rem;
      outline: none;
      transition: border-color 0.2s;
    }

    .form-control:focus {
      border-color: var(--primary);
    }

    /* Grid Layout */
    .upload-section {
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 24px;
      margin-bottom: 24px;
    }

    .image-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
      gap: 20px;
      margin-top: 20px;
    }

    .image-card {
      background: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .image-preview-wrapper {
      position: relative;
      width: 100%;
      padding-top: 75%; /* 4:3 aspect ratio */
      background: #e2e8f0;
    }

    .image-preview-wrapper img {
      position: absolute;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    .image-info {
      padding: 12px;
      flex-grow: 1;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .image-title {
      font-weight: 600;
      font-size: 0.95rem;
      margin-bottom: 12px;
      color: var(--deep);
      word-break: break-word;
    }

    .image-actions {
      display: flex;
      gap: 8px;
    }

    .image-actions .btn {
      flex: 1;
      padding: 8px 10px;
      font-size: 0.85rem;
    }

    /* Overlay loader / alerts */
    .alert {
      padding: 12px;
      border-radius: 8px;
      margin-bottom: 16px;
      font-weight: 500;
      display: none;
    }

    .alert-danger { background: #ffeeef; color: var(--danger); border: 1px solid #fecaca; }
    .alert-success { background: #f0fdf4; color: var(--success); border: 1px solid #bbf7d0; }

    .loading {
      opacity: 0.6;
      pointer-events: none;
    }

    /* Hidden utilities */
    .hidden { display: none !important; }
  </style>
</head>
<body>
  <div class="container">
    <!-- LOGIN SCREEN -->
    <div id="loginScreen" class="card login-container">
      <h2 style="text-align: center; margin-bottom: 24px;">Admin Security Check</h2>
      <div id="loginAlert" class="alert alert-danger"></div>
      <form id="loginForm">
        <div class="form-group">
          <label for="password">Enter Passcode</label>
          <input type="password" id="password" class="form-control" placeholder="\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" required />
        </div>
        <button type="submit" class="btn btn-primary" style="width: 100%;">Access Panel</button>
      </form>
    </div>

    <!-- MAIN DASHBOARD -->
    <div id="dashboardScreen" class="card hidden">
      <div class="admin-header">
        <div>
          <h1>Admin Control Panel</h1>
          <p style="color: var(--muted); margin: 0;">Manage gallery images for Mothotsi Security Steel</p>
        </div>
        <div style="display: flex; gap: 10px;">
          <a href="/gallery" class="btn btn-secondary">View Gallery</a>
          <button id="logoutBtn" class="btn btn-danger">Logout</button>
        </div>
      </div>

      <div id="actionAlert" class="alert"></div>

      <!-- Upload Section -->
      <div class="upload-section">
        <h3>Upload New Project Photo</h3>
        <form id="uploadForm" style="display: flex; flex-direction: column; gap: 16px;">
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 16px;">
            <div class="form-group" style="margin: 0;">
              <label for="photoTitle">Project Title / Caption</label>
              <input type="text" id="photoTitle" class="form-control" placeholder="e.g. Modern Steel Sliding Gate" required />
            </div>
            <div class="form-group" style="margin: 0;">
              <label for="photoFile">Choose Image File</label>
              <input type="file" id="photoFile" class="form-control" accept="image/*" required />
            </div>
          </div>
          <div>
            <button type="submit" id="uploadBtn" class="btn btn-success">Upload and Publish</button>
          </div>
        </form>
      </div>

      <!-- Current Pictures -->
      <div>
        <h3>Current Gallery Images (<span id="imageCount">0</span>)</h3>
        <div id="emptyMessage" style="text-align: center; color: var(--muted); padding: 40px 0;">
          No images uploaded yet. Use the form above to add your first photo!
        </div>
        <div id="imageGrid" class="image-grid">
          <!-- Dynamically populated -->
        </div>
      </div>
    </div>
  </div>

  <script>
    // State management
    let authToken = localStorage.getItem('adminToken') || '';

    // Elements
    const loginScreen = document.getElementById('loginScreen');
    const dashboardScreen = document.getElementById('dashboardScreen');
    const loginForm = document.getElementById('loginForm');
    const passwordInput = document.getElementById('password');
    const loginAlert = document.getElementById('loginAlert');
    const actionAlert = document.getElementById('actionAlert');
    const logoutBtn = document.getElementById('logoutBtn');
    const uploadForm = document.getElementById('uploadForm');
    const imageGrid = document.getElementById('imageGrid');
    const imageCount = document.getElementById('imageCount');
    const emptyMessage = document.getElementById('emptyMessage');

    // Init page based on auth state
    function init() {
      if (authToken) {
        showDashboard();
      } else {
        showLogin();
      }
    }

    function showLogin() {
      loginScreen.classList.remove('hidden');
      dashboardScreen.classList.add('hidden');
      passwordInput.value = '';
      passwordInput.focus();
    }

    function showDashboard() {
      loginScreen.classList.add('hidden');
      dashboardScreen.classList.remove('hidden');
      loadImages();
    }

    function showAlert(element, message, type = 'success') {
      element.textContent = message;
      element.className = \`alert alert-\${type}\`;
      element.style.display = 'block';
      setTimeout(() => {
        element.style.display = 'none';
      }, 5000);
    }

    // Login Submission
    loginForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const enteredPassword = passwordInput.value.trim();

      if (enteredPassword === 'm1m1') {
        authToken = enteredPassword;
        localStorage.setItem('adminToken', authToken);
        showDashboard();
      } else {
        showAlert(loginAlert, 'Incorrect passcode. Access Denied.', 'danger');
      }
    });

    // Logout
    logoutBtn.addEventListener('click', () => {
      authToken = '';
      localStorage.removeItem('adminToken');
      showLogin();
    });

    // Fetch images list
    async function loadImages() {
      try {
        const res = await fetch('/api/images', {
          headers: { 'Authorization': authToken }
        });

        if (res.status === 401) {
          authToken = '';
          localStorage.removeItem('adminToken');
          showLogin();
          return;
        }

        if (!res.ok) {
          throw new Error('Failed to load images');
        }

        const images = await res.json();
        renderImages(images);
      } catch (err) {
        showAlert(actionAlert, 'Error loading gallery: ' + err.message, 'danger');
      }
    }

    function renderImages(images) {
      imageCount.textContent = images.length;
      imageGrid.innerHTML = '';

      if (images.length === 0) {
        emptyMessage.classList.remove('hidden');
        return;
      }

      emptyMessage.classList.add('hidden');

      images.forEach(img => {
        const col = document.createElement('div');
        col.className = 'image-card';
        col.innerHTML = \`
          <div class="image-preview-wrapper">
            <img src="/image/\${img.id}" alt="\${escapeHtml(img.title)}" />
          </div>
          <div class="image-info">
            <div class="image-title" id="title-\${img.id}">\${escapeHtml(img.title)}</div>
            <div class="image-actions">
              <button class="btn btn-secondary" onclick="editTitle('\${img.id}', '\${escapeHtml(img.title)}')">Edit</button>
              <button class="btn btn-danger" onclick="deleteImage('\${img.id}')">Delete</button>
            </div>
          </div>
        \`;
        imageGrid.appendChild(col);
      });
    }

    // Escape helper
    function escapeHtml(str) {
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
    }

    // Upload Form Submission
    uploadForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const titleInput = document.getElementById('photoTitle');
      const fileInput = document.getElementById('photoFile');

      if (!fileInput.files || fileInput.files.length === 0) {
        showAlert(actionAlert, 'Please select an image file to upload.', 'danger');
        return;
      }

      const file = fileInput.files[0];
      const title = titleInput.value.trim();

      // Simple client-side validation for file size (max 20MB for safety)
      if (file.size > 20 * 1024 * 1024) {
        showAlert(actionAlert, 'Image file size is too large (max limit 20MB).', 'danger');
        return;
      }

      dashboardScreen.classList.add('loading');

      // Create FormData to send multipart upload
      const formData = new FormData();
      formData.append('title', title);
      formData.append('file', file);

      try {
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Authorization': authToken },
          body: formData
        });

        if (res.status === 401) {
          authToken = '';
          localStorage.removeItem('adminToken');
          showLogin();
          return;
        }

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Upload failed');
        }

        showAlert(actionAlert, 'Image successfully uploaded!', 'success');
        titleInput.value = '';
        fileInput.value = '';
        loadImages();
      } catch (err) {
        showAlert(actionAlert, 'Error uploading image: ' + err.message, 'danger');
      } finally {
        dashboardScreen.classList.remove('loading');
      }
    });

    // Edit Image Title
    window.editTitle = async function(id, currentTitle) {
      const newTitle = prompt('Edit title for this project photo:', currentTitle);
      if (newTitle === null) return; // User cancelled

      const trimmedTitle = newTitle.trim();
      if (!trimmedTitle) {
        alert('Title cannot be empty');
        return;
      }

      dashboardScreen.classList.add('loading');

      try {
        const res = await fetch('/api/edit', {
          method: 'POST',
          headers: {
            'Authorization': authToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ id, title: trimmedTitle })
        });

        if (res.status === 401) {
          authToken = '';
          localStorage.removeItem('adminToken');
          showLogin();
          return;
        }

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Failed to update title');
        }

        showAlert(actionAlert, 'Title updated successfully!', 'success');
        loadImages();
      } catch (err) {
        showAlert(actionAlert, 'Error updating title: ' + err.message, 'danger');
      } finally {
        dashboardScreen.classList.remove('loading');
      }
    };

    // Delete Image
    window.deleteImage = async function(id) {
      if (!confirm('Are you sure you want to delete this image permanently? This action cannot be undone.')) {
        return;
      }

      dashboardScreen.classList.add('loading');

      try {
        const res = await fetch('/api/delete', {
          method: 'POST',
          headers: {
            'Authorization': authToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ id })
        });

        if (res.status === 401) {
          authToken = '';
          localStorage.removeItem('adminToken');
          showLogin();
          return;
        }

        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || 'Deletion failed');
        }

        showAlert(actionAlert, 'Image deleted successfully!', 'success');
        loadImages();
      } catch (err) {
        showAlert(actionAlert, 'Error deleting image: ' + err.message, 'danger');
      } finally {
        dashboardScreen.classList.remove('loading');
      }
    };

    // Start App
    init();
  <\/script>
</body>
</html>
`;
var galleryTemplate = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Gallery - Mothotsi Security Steel</title>
  <meta name="description" content="Gallery of Mothotsi Security Steel projects." />
  <style>
    body { font-family: Arial, Helvetica, sans-serif; margin: 0; padding: 20px; background: #f7fbff; color: #0f172a; }
    .container { max-width: 900px; margin: 0 auto; }
    header { display: flex; align-items: center; justify-content: space-between; }
    a.button { display: inline-block; padding: 10px 14px; background: #0b5ed7; color: white; text-decoration: none; border-radius: 8px; }
    .gallery { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 16px; margin-top: 20px; }
    .tile { background: white; border-radius: 10px; padding: 10px; box-shadow: 0 6px 18px rgba(11, 94, 215, 0.08); }
    .tile img { width: 100%; height: 160px; object-fit: cover; border-radius: 6px; }
  </style>
</head>
<body>
  <div class="container">
    <header>
      <h1>Gallery</h1>
      <a class="button" href="index.html">Back</a>
    </header>

    <p>Explore some of our recent steel and gate installation work.</p>

    <div class="gallery">
      <div class="tile"><img src="header/mothotsi.jpg" alt="Project 1" /><p>Project 1</p></div>
      <div class="tile"><img src="header/mothotsi.jpg" alt="Project 2" /><p>Project 2</p></div>
      <div class="tile"><img src="header/mothotsi.jpg" alt="Project 3" /><p>Project 3</p></div>
    </div>
  </div>
</body>
</html>`;

// ../home/jules/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-ensure-req-body-drained.ts
var drainBody = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } finally {
    try {
      if (request.body !== null && !request.bodyUsed) {
        const reader = request.body.getReader();
        while (!(await reader.read()).done) {
        }
      }
    } catch (e) {
      console.error("Failed to drain the unused request body.", e);
    }
  }
}, "drainBody");
var middleware_ensure_req_body_drained_default = drainBody;

// ../home/jules/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/middleware-miniflare3-json-error.ts
function reduceError(e) {
  return {
    name: e?.name,
    message: e?.message ?? String(e),
    stack: e?.stack,
    cause: e?.cause === void 0 ? void 0 : reduceError(e.cause)
  };
}
__name(reduceError, "reduceError");
var jsonError = /* @__PURE__ */ __name(async (request, env, _ctx, middlewareCtx) => {
  try {
    return await middlewareCtx.next(request, env);
  } catch (e) {
    const error = reduceError(e);
    const body = JSON.stringify(error);
    const headers = {
      "Content-Type": "application/json",
      "MF-Experimental-Error-Stack": "true"
    };
    const encoded = encodeURIComponent(body);
    if (encoded.length <= 8192) {
      headers["MF-Experimental-Error-Stack-Payload"] = encoded;
    }
    return new Response(body, { status: 500, headers });
  }
}, "jsonError");
var middleware_miniflare3_json_error_default = jsonError;

// .wrangler/tmp/bundle-TDwAxA/middleware-insertion-facade.js
var __INTERNAL_WRANGLER_MIDDLEWARE__ = [
  middleware_ensure_req_body_drained_default,
  middleware_miniflare3_json_error_default
];
var middleware_insertion_facade_default = worker_default;

// ../home/jules/.npm/_npx/32026684e21afda6/node_modules/wrangler/templates/middleware/common.ts
var __facade_middleware__ = [];
function __facade_register__(...args) {
  __facade_middleware__.push(...args.flat());
}
__name(__facade_register__, "__facade_register__");
function __facade_invokeChain__(request, env, ctx, dispatch, middlewareChain) {
  const [head, ...tail] = middlewareChain;
  const middlewareCtx = {
    dispatch,
    next(newRequest, newEnv) {
      return __facade_invokeChain__(newRequest, newEnv, ctx, dispatch, tail);
    }
  };
  return head(request, env, ctx, middlewareCtx);
}
__name(__facade_invokeChain__, "__facade_invokeChain__");
function __facade_invoke__(request, env, ctx, dispatch, finalMiddleware) {
  return __facade_invokeChain__(request, env, ctx, dispatch, [
    ...__facade_middleware__,
    finalMiddleware
  ]);
}
__name(__facade_invoke__, "__facade_invoke__");

// .wrangler/tmp/bundle-TDwAxA/middleware-loader.entry.ts
var __Facade_ScheduledController__ = class ___Facade_ScheduledController__ {
  constructor(scheduledTime, cron, noRetry) {
    this.scheduledTime = scheduledTime;
    this.cron = cron;
    this.#noRetry = noRetry;
  }
  scheduledTime;
  cron;
  static {
    __name(this, "__Facade_ScheduledController__");
  }
  #noRetry;
  noRetry() {
    if (!(this instanceof ___Facade_ScheduledController__)) {
      throw new TypeError("Illegal invocation");
    }
    this.#noRetry();
  }
};
function wrapExportedHandler(worker) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return worker;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  const fetchDispatcher = /* @__PURE__ */ __name(function(request, env, ctx) {
    if (worker.fetch === void 0) {
      throw new Error("Handler does not export a fetch() function.");
    }
    return worker.fetch(request, env, ctx);
  }, "fetchDispatcher");
  return {
    ...worker,
    fetch(request, env, ctx) {
      const dispatcher = /* @__PURE__ */ __name(function(type, init) {
        if (type === "scheduled" && worker.scheduled !== void 0) {
          const controller = new __Facade_ScheduledController__(
            Date.now(),
            init.cron ?? "",
            () => {
            }
          );
          return worker.scheduled(controller, env, ctx);
        }
      }, "dispatcher");
      return __facade_invoke__(request, env, ctx, dispatcher, fetchDispatcher);
    }
  };
}
__name(wrapExportedHandler, "wrapExportedHandler");
function wrapWorkerEntrypoint(klass) {
  if (__INTERNAL_WRANGLER_MIDDLEWARE__ === void 0 || __INTERNAL_WRANGLER_MIDDLEWARE__.length === 0) {
    return klass;
  }
  for (const middleware of __INTERNAL_WRANGLER_MIDDLEWARE__) {
    __facade_register__(middleware);
  }
  return class extends klass {
    #fetchDispatcher = /* @__PURE__ */ __name((request, env, ctx) => {
      this.env = env;
      this.ctx = ctx;
      if (super.fetch === void 0) {
        throw new Error("Entrypoint class does not define a fetch() function.");
      }
      return super.fetch(request);
    }, "#fetchDispatcher");
    #dispatcher = /* @__PURE__ */ __name((type, init) => {
      if (type === "scheduled" && super.scheduled !== void 0) {
        const controller = new __Facade_ScheduledController__(
          Date.now(),
          init.cron ?? "",
          () => {
          }
        );
        return super.scheduled(controller);
      }
    }, "#dispatcher");
    fetch(request) {
      return __facade_invoke__(
        request,
        this.env,
        this.ctx,
        this.#dispatcher,
        this.#fetchDispatcher
      );
    }
  };
}
__name(wrapWorkerEntrypoint, "wrapWorkerEntrypoint");
var WRAPPED_ENTRY;
if (typeof middleware_insertion_facade_default === "object") {
  WRAPPED_ENTRY = wrapExportedHandler(middleware_insertion_facade_default);
} else if (typeof middleware_insertion_facade_default === "function") {
  WRAPPED_ENTRY = wrapWorkerEntrypoint(middleware_insertion_facade_default);
}
var middleware_loader_entry_default = WRAPPED_ENTRY;
export {
  __INTERNAL_WRANGLER_MIDDLEWARE__,
  middleware_loader_entry_default as default
};
//# sourceMappingURL=worker.js.map
