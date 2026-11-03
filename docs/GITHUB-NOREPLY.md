# Create and use a GitHub noreply identity

Do this before the first commit. It prevents the machine's global Git identity
(personal name / QQ mailbox) from becoming public in the commit.

## 1. Enable the private address on GitHub

1. Sign in to GitHub.
2. Open **Settings → Emails**.
3. Enable **Keep my email addresses private**.
4. Copy the generated address:

```text
<GitHub numeric ID>+<username>@users.noreply.github.com
```

Older accounts may show:

```text
<username>@users.noreply.github.com
```

Do not use the QQ mailbox or any other personal mailbox for this repository.

## 2. Set the identity only in this repository

Run from the repository root:

```powershell
git config --local user.name "<your public display name>"
git config --local user.email "<id>+<username>@users.noreply.github.com"
git config --local user.useConfigOnly true
```

`user.useConfigOnly true` makes Git fail instead of silently falling back to the
global personal identity.

Verify the source of the setting:

```powershell
git config --show-origin --get user.name
git config --show-origin --get user.email
```

The origin must be `.git/config` in this repository, not the global config file.

## 3. Create the first commit and push

After the GitHub repository exists (empty, no README initialized):

```powershell
git add -A
git commit -m "feat: initial public Mission Control"
git log -1 --format="%an <%ae>"
git remote add origin https://github.com/<username>/<repository>.git
git push -u origin main
```

Check the log line contains the noreply address, then push. If the log shows the
QQ mailbox, do not push; amend the author first.

## 4. If you only upload the source archive

`E:\Dashboard-0.5.0.zip` contains no `.git` directory and therefore no commit
author metadata. Uploading that archive as a release cannot leak the global Git
identity.

## Troubleshooting

```powershell
# Is a global identity configured?
git config --global --get user.name
git config --global --get user.email

# Was useConfigOnly applied to this repo?
git config --local --get user.useConfigOnly

# Fix the last commit author before pushing
git commit --amend --reset-author --no-edit
```
