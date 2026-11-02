import { describe, expect, it } from 'vitest'
import {
  base64Url,
  bunnySigningData,
  bunnyStreamPlaylistUrl,
  normalizeBunnyHost,
  signBunnyDirectoryUrl,
  signBunnyQueryUrl,
  signBunnyToken,
} from '@/lib/video/bunny'

/**
 * Known vectors for Bunny Advanced Token Authentication
 * (https://bunny.net/docs/cdn/security/token-authentication/advanced):
 *   token = "HS256-" + Base64URL(HMAC-SHA256(key, signature_path + expires + signing_data))
 *
 * Expected hashes were computed independently with OpenSSL, e.g.
 *   printf '%s' '/videos/stream1/1598024587token_path=/videos/stream1/' \
 *     | openssl dgst -sha256 -hmac 'your-security-key' -binary | openssl base64 -A | tr '+/' '-_' | tr -d '='
 * using the docs' example values (key `your-security-key`, expires `1598024587`,
 * token_path `/videos/stream1/`).
 */
const DOC_KEY = 'your-security-key'
const DOC_EXPIRES = 1598024587

describe('Bunny advanced token authentication', () => {
  it('signs a single file (no token_path): message = path + expires', () => {
    expect(signBunnyToken({ securityKey: DOC_KEY, path: '/videos/playlist.m3u8', expires: DOC_EXPIRES })).toBe(
      'HS256-kZXQ5QgTVTdHE7PdFIBdGb99nTFlOUxPddGqFdycWfQ',
    )
  })

  it('signs a directory token: signature path = token_path, token_path is part of signing data', () => {
    expect(
      signBunnyToken({ securityKey: DOC_KEY, path: '/videos/stream1/playlist.m3u8', tokenPath: '/videos/stream1/', expires: DOC_EXPIRES }),
    ).toBe('HS256-MvDbrK66vpAbHacQZ4jHUc95EMYSPvOUmPMMdzwE134')
  })

  it('sorts extra parameters alphabetically in the signing data', () => {
    expect(
      signBunnyToken({
        securityKey: DOC_KEY,
        path: '/videos/stream1/playlist.m3u8',
        tokenPath: '/videos/stream1/',
        expires: DOC_EXPIRES,
        params: { limit: '500' },
      }),
    ).toBe('HS256-iBQEUqlHfTveD1xwhpxXAIpRIKW_jCByjRy740yAWjQ')
    expect(bunnySigningData({ token_path: '/a/', limit: '500', token: 'x', expires: '1' })).toBe('limit=500&token_path=/a/')
  })

  it('base64url strips padding and replaces + and /', () => {
    expect(base64Url(Buffer.from([0xfb, 0xff]))).toBe('-_8')
    expect(base64Url(Buffer.from('a'))).toBe('YQ')
  })

  it('builds the documented directory URL format', () => {
    expect(
      signBunnyDirectoryUrl('myzone.b-cdn.net', {
        securityKey: DOC_KEY,
        path: '/videos/stream1/playlist.m3u8',
        tokenPath: '/videos/stream1/',
        expires: DOC_EXPIRES,
      }),
    ).toBe(
      'https://myzone.b-cdn.net/bcdn_token=HS256-MvDbrK66vpAbHacQZ4jHUc95EMYSPvOUmPMMdzwE134&expires=1598024587&token_path=%2Fvideos%2Fstream1%2F/videos/stream1/playlist.m3u8',
    )
  })

  it('builds the documented query-string URL format', () => {
    expect(signBunnyQueryUrl('https://myzone.b-cdn.net/', { securityKey: DOC_KEY, path: '/videos/playlist.m3u8', expires: DOC_EXPIRES })).toBe(
      'https://myzone.b-cdn.net/videos/playlist.m3u8?token=HS256-kZXQ5QgTVTdHE7PdFIBdGb99nTFlOUxPddGqFdycWfQ&expires=1598024587',
    )
  })

  it('signs a Bunny Stream playlist with a directory token for the video folder', () => {
    const videoId = '0b7c6f3e-2d4a-4f8e-9c1b-5a6d7e8f9a0b'
    const url = bunnyStreamPlaylistUrl({
      host: 'vz-abc123.b-cdn.net',
      securityKey: 'a1b2c3d4-e5f6-7890-abcd-ef0123456789',
      videoId,
      expires: 1767225600,
    })
    expect(url).toBe(
      `https://vz-abc123.b-cdn.net/bcdn_token=HS256-RC5YWHaOCXtqiBwlo93w_ZKN-BGxhHmBaqgrTZICTcM&expires=1767225600&token_path=%2F${videoId}%2F/${videoId}/playlist.m3u8`,
    )
  })

  it('rejects video ids that could alter the signed path, and bad inputs', () => {
    const base = { host: 'vz.b-cdn.net', securityKey: 'k', expires: 1767225600 }
    expect(() => bunnyStreamPlaylistUrl({ ...base, videoId: '../secret' })).toThrow()
    expect(() => bunnyStreamPlaylistUrl({ ...base, videoId: 'abc/def-123456' })).toThrow()
    expect(() => signBunnyToken({ securityKey: '', path: '/a', expires: 1 })).toThrow()
    expect(() => signBunnyToken({ securityKey: 'k', path: '/a', expires: 1.5 })).toThrow()
  })

  it('normalizes configured hosts', () => {
    expect(normalizeBunnyHost(' https://vz-1.b-cdn.net/ ')).toBe('vz-1.b-cdn.net')
    expect(normalizeBunnyHost('vz-1.b-cdn.net')).toBe('vz-1.b-cdn.net')
  })
})
