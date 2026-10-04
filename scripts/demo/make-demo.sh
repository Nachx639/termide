#!/usr/bin/env bash
# Records assets/termide-demo.gif and assets/screenshot.png with VHS
# (https://github.com/charmbracelet/vhs) in a throwaway sample project.
# Nothing from your machine shows up: fake HOME, neutral prompt, a "Demo Dev"
# git identity, and termide's sessions in a temp dir.
#
#   scripts/demo/make-demo.sh
set -euo pipefail

REPO="$(cd "$(dirname "$0")/../.." && pwd)"
WORK="$(cd "$(mktemp -d)" && pwd -P)"   # real path: macOS temp dirs are symlinks
HOME_DIR="$WORK/home"
PROJ="$HOME_DIR/acme-api"
ZDOT="$WORK/zdot"
trap 'rm -rf "$WORK"' EXIT

mkdir -p "$PROJ/src/routes" "$PROJ/tests" "$ZDOT"
cat > "$PROJ/src/server.ts" <<'TS'
import { listUsers, createUser } from "./routes/users";

const port = Number(process.env.PORT ?? 3000);

export const server = Bun.serve({
  port,
  routes: {
    "/health": () => new Response("ok"),
    "/users": { GET: listUsers, POST: createUser },
  },
});

console.log(`acme-api listening on :${port}`);
TS
cat > "$PROJ/src/routes/users.ts" <<'TS'
type User = { id: number; name: string; email: string };

const users: User[] = [{ id: 1, name: "Ada", email: "ada@example.com" }];

export function listUsers(): Response {
  return Response.json(users);
}

export async function createUser(req: Request): Promise<Response> {
  const body = (await req.json()) as Omit<User, "id">;
  const user = { id: users.length + 1, ...body };
  users.push(user);
  return Response.json(user, { status: 201 });
}
TS
cat > "$PROJ/tests/users.test.ts" <<'TS'
import { test, expect } from "bun:test";
import { listUsers } from "../src/routes/users";

test("lists users", async () => {
  expect((await listUsers().json()).length).toBeGreaterThan(0);
});
TS
printf '# acme-api\n\nA tiny Bun API used in the termide demo.\n' > "$PROJ/README.md"
printf '{ "name": "acme-api", "private": true }\n' > "$PROJ/package.json"

export GIT_AUTHOR_NAME="Demo Dev" GIT_AUTHOR_EMAIL="demo@example.com"
export GIT_COMMITTER_NAME="Demo Dev" GIT_COMMITTER_EMAIL="demo@example.com"
export GIT_CONFIG_GLOBAL=/dev/null GIT_CONFIG_NOSYSTEM=1
git -C "$PROJ" init -q -b main
git -C "$PROJ" add README.md package.json && git -C "$PROJ" commit -qm "chore: initial commit"
git -C "$PROJ" add src && git -C "$PROJ" commit -qm "feat: users API"
git -C "$PROJ" add tests && git -C "$PROJ" commit -qm "test: users route"
printf '\nexport const VERSION = "1.2.0";\n' >> "$PROJ/src/server.ts"   # an uncommitted change

cat > "$ZDOT/.zshrc" <<ZSH
unset HISTFILE
SAVEHIST=0
PROMPT='%F{cyan}%~%f ❯ '
termide() { bun "$REPO/src/index.tsx" "\$@"; }
ZSH

TAPE="$WORK/demo.tape"
cat > "$TAPE" <<TAPE
Output "$WORK/frames/"
Set Shell "zsh"
Set FontSize 15
Set Width 1400
Set Height 820
Set LineHeight 1.0
Set TypingSpeed 45ms
Set Theme "Catppuccin Mocha"

Hide
Type "export HOME='$HOME_DIR' ZDOTDIR='$ZDOT' TERMIDE_SESSION_DIR='$WORK/sessions' GIT_CONFIG_GLOBAL=/dev/null && source '$ZDOT/.zshrc' && cd ~/acme-api && clear"
Enter
Sleep 1s
Show

Type "termide"
Sleep 400ms
Enter
Sleep 3.5s

# Open a file with the fuzzy finder (Ctrl+X P), syntax highlighted
Ctrl+X
Type "p"
Sleep 600ms
Type "users"
Sleep 900ms
Enter
Sleep 2s

# Into the terminal (editor → terminal): every key goes to the shell
Ctrl+X
Tab
Sleep 800ms
Type "git log --oneline"
Enter
Sleep 1.2s
Type "bun test 2>&1 | tail -4"
Enter
Sleep 2.5s

# Split the terminal side by side
Ctrl+X
Type '\\'
Sleep 1.2s
Type "ls src"
Enter
Sleep 1.5s
Sleep 200ms

# Command palette
Ctrl+X
Type "k"
Sleep 600ms
Type "theme"
Sleep 1.5s
Escape
Sleep 800ms

# Help
Ctrl+X
Type "h"
Sleep 2.5s
Escape
Sleep 1s
TAPE

cd "$WORK"
vhs "$TAPE"

# VHS writes text and cursor layers per frame; its own GIF step calls ffmpeg
# with options newer ffmpeg releases removed, so assemble the GIF here.
ffmpeg -loglevel error -y \
  -framerate 50 -i "$WORK/frames/frame-text-%05d.png" \
  -framerate 50 -i "$WORK/frames/frame-cursor-%05d.png" \
  -filter_complex "[0][1]overlay,pad=iw+48:ih+48:24:24:color=0x1e1e2e,fps=10,scale=1200:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=4" \
  "$REPO/assets/termide-demo.gif"
# Full-resolution still for the README: the frame just before the palette opens.
N=$(ls "$WORK/frames" | grep -c frame-text)
SHOT=$(( N * 72 / 100 ))
ffmpeg -loglevel error -y \
  -start_number "$SHOT" -i "$WORK/frames/frame-text-%05d.png" \
  -start_number "$SHOT" -i "$WORK/frames/frame-cursor-%05d.png" \
  -filter_complex "[0][1]overlay,pad=iw+48:ih+48:24:24:color=0x1e1e2e" -frames:v 1 "$REPO/assets/screenshot.png"
echo "wrote $REPO/assets/termide-demo.gif and $REPO/assets/screenshot.png"
