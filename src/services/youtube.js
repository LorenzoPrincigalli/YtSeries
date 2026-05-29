import { API, YOUTUBE_API_MAX_RESULTS } from '../shared/constants.js'
import { logger } from '../shared/logger.js'

class YouTubeApiService {
  constructor() {
    this.apiKey = ''
  }

  setApiKey(key) {
    this.apiKey = key
  }

  _buildUrl(path) {
    const base = API.WORKER_BASE || API.YOUTUBE_BASE
    const keySuffix = API.WORKER_BASE ? '' : `&key=${this.apiKey}`
    return `${base}${path}${keySuffix}`
  }

  async fetchPlaylist(playlistUrl) {
    const playlistId = this._extractPlaylistId(playlistUrl)
    if (!playlistId) {
      throw { code: 'INVALID_URL', message: 'Invalid YouTube playlist URL' }
    }

    const playlist = await this._getPlaylistDetails(playlistId)
    const videos = await this._getPlaylistItems(playlistId)

    return {
      playlistId,
      title: playlist.snippet.title,
      description: playlist.snippet.description || '',
      thumbnail: playlist.snippet.thumbnails?.maxres?.url
        || playlist.snippet.thumbnails?.high?.url
        || playlist.snippet.thumbnails?.medium?.url
        || playlist.snippet.thumbnails?.default?.url
        || '',
      channelTitle: playlist.snippet.channelTitle,
      channelId: playlist.snippet.channelId,
      videoCount: parseInt(playlist.contentDetails?.itemCount || videos.length, 10),
      videos
    }
  }

  async refreshPlaylist(playlistId) {
    const videos = await this._getPlaylistItems(playlistId)
    const playlist = await this._getPlaylistDetails(playlistId)

    return {
      playlistId,
      title: playlist.snippet.title,
      description: playlist.snippet.description || '',
      thumbnail: playlist.snippet.thumbnails?.maxres?.url
        || playlist.snippet.thumbnails?.high?.url
        || playlist.snippet.thumbnails?.medium?.url
        || playlist.snippet.thumbnails?.default?.url
        || '',
      channelTitle: playlist.snippet.channelTitle,
      channelId: playlist.snippet.channelId,
      videoCount: parseInt(playlist.contentDetails?.itemCount || videos.length, 10),
      videos
    }
  }

  async fetchChannelPlaylists(channelId, excludePlaylistId) {
    if (!channelId) return []

    try {
      const data = await this._fetch(this._buildUrl(`/playlists?part=snippet&channelId=${channelId}&maxResults=10`))

      if (!data.items) return []

      return data.items
        .filter(item => item.id !== excludePlaylistId)
        .map(item => ({
          playlistId: item.id,
          title: item.snippet.title,
          thumbnail: item.snippet.thumbnails?.high?.url
            || item.snippet.thumbnails?.medium?.url
            || item.snippet.thumbnails?.default?.url
            || '',
          channelTitle: item.snippet.channelTitle,
          channelId: item.snippet.channelId,
          videoCount: item.contentDetails?.itemCount || 0
        }))
    } catch (err) {
      logger.warn('Failed to fetch channel playlists:', err)
      return []
    }
  }

  _extractPlaylistId(url) {
    if (typeof url !== 'string') return null
    if (!url.startsWith('https://')) return null

    const patterns = [
      /[?&]list=([^&]+)/,
      /youtube\.com\/playlist\?list=([^&]+)/,
      /youtu\.be\/.*[?&]list=([^&]+)/
    ]

    for (const pattern of patterns) {
      const match = url.match(pattern)
      if (match) return match[1]
    }

    return null
  }

  async search(query) {
    if (!query || !query.trim()) return { playlists: [], channels: [] }

    try {
      const data = await this._fetch(this._buildUrl(`/search?part=snippet&type=playlist,channel&maxResults=15&q=${encodeURIComponent(query)}`))

      const items = data.items || []
      let playlists = []
      let channels = []

      for (const item of items) {
        if (item.id?.kind === 'youtube#playlist') {
          playlists.push({
            playlistId: item.id.playlistId,
            title: item.snippet.title,
            description: item.snippet.description || '',
            thumbnail: item.snippet.thumbnails?.high?.url
              || item.snippet.thumbnails?.medium?.url
              || item.snippet.thumbnails?.default?.url
              || '',
            channelTitle: item.snippet.channelTitle,
            channelId: item.snippet.channelId,
            publishedAt: item.snippet.publishedAt
          })
        } else if (item.id?.kind === 'youtube#channel') {
          channels.push({
            channelId: item.snippet.channelId,
            title: item.snippet.title,
            description: item.snippet.description || '',
            thumbnail: item.snippet.thumbnails?.high?.url
              || item.snippet.thumbnails?.medium?.url
              || item.snippet.thumbnails?.default?.url
              || '',
            publishedAt: item.snippet.publishedAt
          })
        }
      }

      return { playlists, channels }
    } catch (err) {
      logger.warn('Failed to search:', err)
      return { playlists: [], channels: [] }
    }
  }

  async _fetch(url) {
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) })

    if (!response.ok) {
      const errorBody = await response.text()
      logger.error('YouTube API error:', response.status, errorBody.slice(0, 200))
      throw {
        code: 'API_ERROR',
        message: `YouTube API returned ${response.status}`,
        context: { status: response.status }
      }
    }

    return response.json()
  }

  async _getPlaylistDetails(playlistId) {
    const data = await this._fetch(this._buildUrl(`/playlists?part=snippet,contentDetails&id=${playlistId}`))

    if (!data.items || data.items.length === 0) {
      throw { code: 'PLAYLIST_NOT_FOUND', message: 'Playlist not found' }
    }

    return data.items[0]
  }

  async _getPlaylistItems(playlistId) {
    const videos = []
    let nextPageToken = ''

    do {
      const data = await this._fetch(this._buildUrl(`/playlistItems?part=snippet,contentDetails&maxResults=${YOUTUBE_API_MAX_RESULTS}&playlistId=${playlistId}${nextPageToken ? `&pageToken=${nextPageToken}` : ''}`))

      if (data.items) {
        for (const item of data.items) {
          if (item.snippet && item.snippet.resourceId && item.snippet.resourceId.videoId) {
            const videoId = item.snippet.resourceId.videoId
            videos.push({
              id: videoId,
              title: item.snippet.title || 'Untitled',
              thumbnail: item.snippet.thumbnails?.maxres?.url
                || item.snippet.thumbnails?.high?.url
                || item.snippet.thumbnails?.medium?.url
                || item.snippet.thumbnails?.default?.url
                || '',
              position: item.snippet.position || 0,
              publishedAt: item.snippet.publishedAt
            })
          }
        }
      }

      nextPageToken = data.nextPageToken || ''
    } while (nextPageToken)

    if (videos.length > 0) {
      const videoIds = videos.map(v => v.id)
      const durations = await this._getVideoDurations(videoIds)
      for (const v of videos) {
        v.duration = durations[v.id] || 0
      }
    }

    return videos
  }

  async _getVideoDurations(videoIds) {
    const chunks = this._chunkArray(videoIds, 50)
    const durations = {}

    for (const chunk of chunks) {
      const ids = chunk.join(',')
      const data = await this._fetch(this._buildUrl(`/videos?part=contentDetails&id=${ids}`))

      if (data.items) {
        for (const item of data.items) {
          durations[item.id] = this._parseISO8601Duration(item.contentDetails.duration)
        }
      }
    }

    return durations
  }

  _parseISO8601Duration(duration) {
    if (typeof duration !== 'string') return 0
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/)
    if (!match) return 0

    const hours = parseInt(match[1]?.replace('H', '') || '0', 10)
    const minutes = parseInt(match[2]?.replace('M', '') || '0', 10)
    const seconds = parseInt(match[3]?.replace('S', '') || '0', 10)

    return hours * 3600 + minutes * 60 + seconds
  }

  _chunkArray(arr, size) {
    const chunks = []
    for (let i = 0; i < arr.length; i += size) {
      chunks.push(arr.slice(i, i + size))
    }
    return chunks
  }
}

const youTubeApiService = new YouTubeApiService()
export { youTubeApiService }
