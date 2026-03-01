'use client';

import { useState } from 'react';
import { Image, Video, Sparkles, Loader2, Settings2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@shared/ui/card';
import { Button } from '@shared/ui/button';
import { Badge } from '@shared/ui/badge';
import { Textarea } from '@shared/ui/textarea';
import { cn } from '@shared/lib/utils';
import { MediaGallery } from '@/components/Media/MediaGallery';

type Tab = 'image' | 'video';
type ImageStyle = 'photo' | 'art' | 'illustration' | '3d-render';
type ImageSize = '1:1' | '16:9' | '4:3' | '9:16';
type ImageModel = 'dall-e-3' | 'google-imagen' | 'flux';
type VideoDuration = '4s' | '8s' | '16s';

const IMAGE_STYLES: { value: ImageStyle; label: string }[] = [
  { value: 'photo', label: 'Photo' },
  { value: 'art', label: 'Art' },
  { value: 'illustration', label: 'Illustration' },
  { value: '3d-render', label: '3D Render' },
];

const IMAGE_SIZES: { value: ImageSize; label: string }[] = [
  { value: '1:1', label: '1:1' },
  { value: '16:9', label: '16:9' },
  { value: '4:3', label: '4:3' },
  { value: '9:16', label: '9:16' },
];

const IMAGE_MODELS: { value: ImageModel; label: string }[] = [
  { value: 'dall-e-3', label: 'DALL-E 3' },
  { value: 'google-imagen', label: 'Google Imagen' },
  { value: 'flux', label: 'Flux' },
];

const VIDEO_DURATIONS: { value: VideoDuration; label: string }[] = [
  { value: '4s', label: '4s' },
  { value: '8s', label: '8s' },
  { value: '16s', label: '16s' },
];

export function MediaStudio() {
  const [activeTab, setActiveTab] = useState<Tab>('image');
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageStyle, setImageStyle] = useState<ImageStyle>('photo');
  const [imageSize, setImageSize] = useState<ImageSize>('1:1');
  const [imageModel, setImageModel] = useState<ImageModel>('dall-e-3');
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoDuration, setVideoDuration] = useState<VideoDuration>('4s');
  const [isGenerating, setIsGenerating] = useState(false);

  const [statusMessage, setStatusMessage] = useState('');

  const handleGenerateImage = () => {
    if (!imagePrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setStatusMessage('');
    setTimeout(() => {
      setIsGenerating(false);
      setStatusMessage('Generation requires API keys configured in Settings.');
    }, 800);
  };

  const handleGenerateVideo = () => {
    if (!videoPrompt.trim() || isGenerating) return;
    setIsGenerating(true);
    setStatusMessage('');
    setTimeout(() => {
      setIsGenerating(false);
      setStatusMessage('Generation requires API keys configured in Settings.');
    }, 800);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Media Studio</h1>
          <p className="text-sm text-muted-foreground">Generate images and videos with AI</p>
        </div>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="w-4 h-4" />
          Settings
        </Button>
      </div>

      {/* Generation Panel */}
      <Card>
        <CardHeader className="pb-4">
          {/* Tab Selector */}
          <div className="flex gap-1 p-1 rounded-lg bg-secondary w-fit">
            <button
              onClick={() => setActiveTab('image')}
              className={cn(
                'flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                activeTab === 'image'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {/* eslint-disable-next-line jsx-a11y/alt-text */}
              <Image className="w-4 h-4" aria-hidden="true" />
              Image
            </button>
            <button
              onClick={() => setActiveTab('video')}
              className={cn(
                'flex items-center gap-2 px-4 py-1.5 rounded-md text-sm font-medium transition-all',
                activeTab === 'video'
                  ? 'bg-background text-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              <Video className="w-4 h-4" />
              Video
            </button>
          </div>
        </CardHeader>

        <CardContent className="space-y-5">
          {activeTab === 'image' ? (
            <>
              {/* Image Prompt */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Prompt</label>
                <Textarea
                  rows={4}
                  placeholder="Describe the image you want to create..."
                  value={imagePrompt}
                  onChange={(e) => setImagePrompt(e.target.value)}
                />
              </div>

              {/* Style Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Style</label>
                <div className="flex flex-wrap gap-2">
                  {IMAGE_STYLES.map((style) => (
                    <button
                      key={style.value}
                      onClick={() => setImageStyle(style.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-sm font-medium border transition-all',
                        imageStyle === style.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80',
                      )}
                    >
                      {style.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Size Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Size</label>
                <div className="flex flex-wrap gap-2">
                  {IMAGE_SIZES.map((size) => (
                    <button
                      key={size.value}
                      onClick={() => setImageSize(size.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-sm font-medium border transition-all',
                        imageSize === size.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80',
                      )}
                    >
                      {size.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model Selector + Generate Button */}
              <div className="flex items-end gap-3">
                <div className="flex-1 space-y-2">
                  <label className="text-sm font-medium text-foreground">Model</label>
                  <select
                    value={imageModel}
                    onChange={(e) => setImageModel(e.target.value as ImageModel)}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  >
                    {IMAGE_MODELS.map((model) => (
                      <option key={model.value} value={model.value}>
                        {model.label}
                      </option>
                    ))}
                  </select>
                </div>

                <Button
                  onClick={handleGenerateImage}
                  disabled={!imagePrompt.trim() || isGenerating}
                  className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  Generate Image
                </Button>
              </div>
            </>
          ) : (
            <>
              {/* Video Prompt */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Prompt</label>
                <Textarea
                  rows={4}
                  placeholder="Describe the video you want to create..."
                  value={videoPrompt}
                  onChange={(e) => setVideoPrompt(e.target.value)}
                />
              </div>

              {/* Duration Selector */}
              <div className="space-y-2">
                <label className="text-sm font-medium text-foreground">Duration</label>
                <div className="flex flex-wrap gap-2">
                  {VIDEO_DURATIONS.map((dur) => (
                    <button
                      key={dur.value}
                      onClick={() => setVideoDuration(dur.value)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-sm font-medium border transition-all',
                        videoDuration === dur.value
                          ? 'bg-primary text-primary-foreground border-primary'
                          : 'border-border text-muted-foreground hover:text-foreground hover:border-border/80',
                      )}
                    >
                      {dur.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Model badge + Generate Button */}
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">Model</span>
                  <Badge variant="secondary">Google Veo</Badge>
                </div>

                <Button
                  onClick={handleGenerateVideo}
                  disabled={!videoPrompt.trim() || isGenerating}
                  className="gap-2 bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70"
                >
                  {isGenerating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Video className="w-4 h-4" />
                  )}
                  Generate Video
                </Button>
              </div>
            </>
          )}
          {statusMessage && (
            <div className="rounded-md border border-yellow-500/30 bg-yellow-500/10 px-4 py-3 text-sm text-yellow-200">
              {statusMessage}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Generations */}
      <div className="space-y-3">
        <h2 className="text-base font-semibold text-foreground">Recent Generations</h2>
        <MediaGallery />
      </div>
    </div>
  );
}
