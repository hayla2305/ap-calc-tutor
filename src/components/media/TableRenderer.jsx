import MediaFallback from './MediaFallback';

export default function TableRenderer({ item }) {
  return <MediaFallback alt={item?.alt} label="[table not implemented yet]" />;
}
