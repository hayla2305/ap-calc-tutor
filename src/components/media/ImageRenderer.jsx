import MediaFallback from './MediaFallback';

export default function ImageRenderer({ item }) {
  return <MediaFallback alt={item?.alt} label="[image not implemented yet]" />;
}
