/** An error whose message is safe and useful to show the end user. Never retried. */
export class UserError extends Error {
  constructor(message: string, public code = 'user_error') {
    super(message);
  }
}

/** Translate raw yt-dlp stderr into something a customer can act on. */
export function classifyYtdlpError(stderr: string): UserError {
  const s = stderr.toLowerCase();
  if (s.includes('not a bot') || s.includes('confirm you’re not a bot') || s.includes("confirm you're not a bot"))
    return new UserError(
      'The video platform temporarily blocked our server. This is on our side, not yours. Please retry in a few minutes or upload the file instead.',
      'platform_blocked',
    );
  if (s.includes('private video') || s.includes('this video is private'))
    return new UserError('This video is private, so it cannot be accessed.', 'private');
  if (s.includes('login required') || s.includes('log in') || s.includes('sign in') || s.includes('cookies'))
    return new UserError(
      'This video requires a login to view (common on Instagram/Facebook private or restricted posts). Upload the file instead.',
      'login_required',
    );
  if (s.includes('unsupported url'))
    return new UserError('This link is not supported. Paste a direct link to a video or audio page.', 'unsupported');
  if (s.includes('video unavailable') || s.includes('has been removed') || s.includes('does not exist') || s.includes('404'))
    return new UserError('This video is unavailable or has been removed.', 'unavailable');
  if (s.includes('geo') || s.includes('not available in your country'))
    return new UserError('This video is not available in our server region.', 'geo');
  if (s.includes('live event') || s.includes('is live') || s.includes('premieres in'))
    return new UserError('Live streams and upcoming premieres cannot be processed until they finish.', 'live');
  if (s.includes('429') || s.includes('too many requests') || s.includes('rate'))
    return new UserError('The platform is rate-limiting us right now. Please retry in a few minutes.', 'rate_limited');
  if (s.includes('max-filesize') || s.includes('larger than max'))
    return new UserError('This video is larger than the maximum allowed file size.', 'too_large');
  return new UserError('We could not download this link. Please check it opens in a browser, or upload the file instead.', 'download_failed');
}
