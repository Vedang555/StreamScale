export const videos = [
  {
    id: 'big-buck-bunny',
    title: 'Big Buck Bunny',
    creator: 'Blender Foundation',
    category: 'ANIMATION',
    duration: '9 min',
    source: 'https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4',
    poster: 'https://images.unsplash.com/photo-1470252649378-9c29740c9fa8?auto=format&fit=crop&w=1000&q=85',
    license: 'CC BY 3.0'
  },
  {
    id: 'sintel-trailer',
    title: 'Sintel: The Trailer',
    creator: 'Blender Foundation',
    category: 'FANTASY',
    duration: '1 min',
    source: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    poster: 'https://images.unsplash.com/photo-1519681393784-d120267933ba?auto=format&fit=crop&w=1000&q=85',
    license: 'CC BY 3.0'
  },
  {
    id: 'spring-flowers',
    title: 'Spring Flowers',
    creator: 'MDN Web Docs',
    category: 'NATURE',
    duration: 'short',
    source: 'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
    poster: 'https://images.unsplash.com/photo-1490750967868-88aa4486c946?auto=format&fit=crop&w=1000&q=85',
    license: 'CC0'
  }
];

export function findVideo(id) {
  return videos.find((video) => video.id === id);
}