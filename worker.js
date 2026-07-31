export default {
  async fetch(request, env, ctx) {
    return new Response("Hello fire World!", {
      headers: { "content-type": "text/plain" },
    });
  },
};
