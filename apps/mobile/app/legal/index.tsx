import { Redirect, type Href } from 'expo-router';

export default function LegalIndex() {
  return <Redirect href={'/legal/article-50' as Href} />;
}
