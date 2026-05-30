// Supabase Edge Function: notify-room-invite
// Triggered by a Database Webhook on INSERT into public.room_members.
// Only fires push when `invited_by` is non-null (host-initiated invite),
// so self-joins (createRoom / joinRoom by code) don't push the joiner.
//
// Deploy:  supabase functions deploy notify-room-invite
// Webhook: Supabase Dashboard → Database → Webhooks → Create
//          Table: room_members · Event: INSERT
//          URL:   https://<project-ref>.functions.supabase.co/notify-room-invite
//          Headers: Authorization: Bearer <service role key>

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE);

Deno.serve(async (req) => {
  try {
    const payload = await req.json();
    const row = payload?.record;
    if (!row?.room_id || !row?.user_id) {
      return new Response("ignored", { status: 200 });
    }
    if (!row.invited_by) {
      return new Response("self-join", { status: 200 });
    }

    const { data: invitee } = await supabase
      .from("users")
      .select("id, name, push_token")
      .eq("id", row.user_id)
      .single();
    if (!invitee?.push_token) {
      return new Response("no token", { status: 200 });
    }

    const { data: room } = await supabase
      .from("rooms")
      .select("id, code, host_id")
      .eq("id", row.room_id)
      .single();
    if (!room) return new Response("no room", { status: 200 });

    const { data: host } = await supabase
      .from("users")
      .select("name")
      .eq("id", room.host_id)
      .single();
    const hostName = host?.name ?? "A friend";

    const message = {
      to: invitee.push_token,
      sound: "default",
      title: "Ride invite",
      body: `${hostName} invited you to a group ride`,
      data: {
        type: "room_invite",
        room_id: room.id,
        room_code: room.code,
      },
    };

    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(message),
    });
    if (!res.ok) console.error("expo push failed", await res.text());

    return new Response("sent", { status: 200 });
  } catch (e) {
    console.error(e);
    return new Response((e as Error).message, { status: 500 });
  }
});
