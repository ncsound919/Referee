import axios from 'axios';

// PubMed search stub
export async function searchPubMed(query: string, maxResults: number = 5) {
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&retmode=json`;
  try {
    const response = await axios.get(url);
    const idList = response.data.esearchresult.idlist;
    return { results: idList.map((id: string) => ({ id })) };
  } catch (error) {
    console.error('PubMed search failed:', error);
    return { results: [] };
  }
}
