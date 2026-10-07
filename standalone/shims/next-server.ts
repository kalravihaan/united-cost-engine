/** `next/server` replacement: route handlers only use NextResponse.json. */
export const NextResponse = {
  json: (body: unknown, init?: ResponseInit) => Response.json(body, init),
};
