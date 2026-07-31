const ADMIN_PASSWORD = "m1m1";

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(),
    },
  });
}

function textResponse(text, status = 200, contentType = "text/plain") {
  return new Response(text, {
    status,
    headers: {
      "Content-Type": contentType,
      ...corsHeaders(),
    },
  });
}

// Helper to authenticate request
function checkAuth(request) {
  const authHeader = request.headers.get("Authorization");
  return authHeader === ADMIN_PASSWORD;
}

// Helper to retrieve all image metadata
async function getImageList(env) {
  const index = await env.FIRE_KV.get("gallery_images_index", { type: "json" });
  return index || [];
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Handle OPTIONS (CORS preflight request)
    if (request.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: corsHeaders()
      });
    }

    // Root status endpoint
    if (path === "/" || path === "/status") {
      return jsonResponse({ status: "ok", message: "Mothotsi Security Steel API Backend" });
    }

    // Serve raw base64 string from KV
    if (path.startsWith("/image/")) {
      const imgId = path.substring(7);
      if (!imgId) {
        return jsonResponse({ error: "Missing Image ID" }, 400);
      }

      // Read image content from Cloudflare KV as text (since we store raw base64 directly)
      const base64Data = await env.FIRE_KV.get(`img:${imgId}`, { type: "text" });
      if (!base64Data) {
        return textResponse("Image Not Found", 404);
      }

      return textResponse(base64Data, 200, "text/plain");
    }

    // API Endpoint: List Images (JSON)
    if (path === "/api/images" && request.method === "GET") {
      try {
        const images = await getImageList(env);
        return jsonResponse(images);
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // API Endpoint: Upload Image (POST)
    if (path === "/api/upload" && request.method === "POST") {
      const authorized = checkAuth(request);
      if (!authorized) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      try {
        const { title, image } = await request.json();

        if (!image) {
          return jsonResponse({ error: "No image base64 data provided" }, 400);
        }

        const id = crypto.randomUUID();

        // Store base64 string directly under img:${id}
        await env.FIRE_KV.put(`img:${id}`, image);

        // Retrieve existing index list
        const imageList = await getImageList(env);

        // Add new image metadata to list
        const newImage = {
          id,
          title: String(title || "Untitled Project"),
          uploadedAt: Date.now()
        };
        imageList.unshift(newImage); // Add to beginning

        // Store updated metadata index
        await env.FIRE_KV.put("gallery_images_index", JSON.stringify(imageList));
        // Also store individual metadata
        await env.FIRE_KV.put(`meta:${id}`, JSON.stringify(newImage));

        return jsonResponse({ success: true, image: newImage });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // API Endpoint: Edit Title (POST)
    if (path === "/api/edit" && request.method === "POST") {
      const authorized = checkAuth(request);
      if (!authorized) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      try {
        const { id, title } = await request.json();
        if (!id || !title) {
          return jsonResponse({ error: "Missing required fields" }, 400);
        }

        const imageList = await getImageList(env);
        const imgIndex = imageList.findIndex(img => img.id === id);

        if (imgIndex === -1) {
          return jsonResponse({ error: "Image not found" }, 404);
        }

        // Update title
        imageList[imgIndex].title = title;

        // Save index
        await env.FIRE_KV.put("gallery_images_index", JSON.stringify(imageList));

        // Save individual metadata
        const individualMeta = await env.FIRE_KV.get(`meta:${id}`, { type: "json" }) || {};
        individualMeta.title = title;
        await env.FIRE_KV.put(`meta:${id}`, JSON.stringify(individualMeta));

        return jsonResponse({ success: true });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // API Endpoint: Delete Image (POST)
    if (path === "/api/delete" && request.method === "POST") {
      const authorized = checkAuth(request);
      if (!authorized) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      try {
        const { id } = await request.json();
        if (!id) {
          return jsonResponse({ error: "Missing ID" }, 400);
        }

        // Remove from list
        let imageList = await getImageList(env);
        imageList = imageList.filter(img => img.id !== id);
        await env.FIRE_KV.put("gallery_images_index", JSON.stringify(imageList));

        // Remove actual KV entries
        await env.FIRE_KV.delete(`img:${id}`);
        await env.FIRE_KV.delete(`meta:${id}`);

        return jsonResponse({ success: true });
      } catch (err) {
        return jsonResponse({ error: err.message }, 500);
      }
    }

    // Default: Resource not found
    return jsonResponse({ error: "Not Found" }, 404);
  },
};
