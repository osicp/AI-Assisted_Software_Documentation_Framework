# =============================================================================
# SCRUMMAP SBERT CLUSTERING & ARCITECTURE RECOVERY (sbert_clustering.py)
# =============================================================================
from typing import List, Dict, Any
import spacy
from sentence_transformers import SentenceTransformer
from sklearn.cluster import KMeans
import numpy as np

# Global cached model instances
_sbert_model = None
_spacy_nlp = None

def get_sbert_model() -> SentenceTransformer:
    global _sbert_model
    if _sbert_model is None:
        _sbert_model = SentenceTransformer('paraphrase-mpnet-base-v2')
    return _sbert_model

def get_spacy_nlp():
    global _spacy_nlp
    if _spacy_nlp is None:
        _spacy_nlp = spacy.load("en_core_web_sm")
    return _spacy_nlp

def extract_actors_from_stories(user_stories: List[str]) -> List[str]:
    # Use triple-single quotes for docstring
    '''
    Extracts Agile actors via spaCy POS tagging: locates the "As a/an" prefix,
    then takes the contiguous run of noun-tagged tokens (NN, NNS, NNP, NNPS)
    immediately following it as the actor noun phrase.
    '''
    nlp = get_spacy_nlp()
    actors = []
    for story in user_stories:
        doc = nlp(story)
        actor = "System User"
        for i, token in enumerate(doc):
            if token.lower_ in ("a", "an") and i > 0 and doc[i - 1].lower_ == "as":
                noun_tokens = []
                for follow in doc[i + 1:]:
                    if follow.tag_ in ("NN", "NNS", "NNP", "NNPS"):
                        noun_tokens.append(follow.text)
                    elif noun_tokens:
                        break
                if noun_tokens:
                    actor = " ".join(noun_tokens)
                break
        actors.append(actor)
    return actors

def cluster_and_align_backlog(user_stories: List[str], n_clusters: int = 3) -> List[Dict[str, Any]]:
    # Use triple-single quotes for docstring
    '''
    Transforms stories into semantic vectors using SBERT, groups them via K-Means,
    and maps them to Presentation, Application, Domain, or Technical Services layers.
    '''
    if not user_stories:
        return []
        
    # Get high-dimensional semantic embeddings
    embeddings = get_sbert_model().encode(user_stories)
    
    # Run K-Means aggregation to eliminate backlog redundancy
    k = max(1, min(n_clusters, len(user_stories)))
    kmeans = KMeans(n_clusters=k, random_state=42, n_init=10)
    cluster_labels = kmeans.fit_predict(embeddings)
    
    actors = extract_actors_from_stories(user_stories)
    clustered_output = []
    
    for idx, story in enumerate(user_stories):
        # Deductively determine reference architectural layer
        story_lower = story.lower()
        if any(w in story_lower for w in ("ui", "screen", "button", "page", "dashboard", "view")):
            layer = "Presentation [Pr]"
        elif any(w in story_lower for w in ("api", "controller", "endpoint", "route", "service")):
            layer = "Application Services [Ap]"
        elif any(w in story_lower for w in ("business rule", "logic", "calculate", "validate", "process")):
            layer = "Domain Services [Do]"
        else:
            layer = "Technical Services [Te]"
            
        clustered_output.append({
            "story": story,
            "actor": actors[idx],
            "cluster_id": int(cluster_labels[idx]),
            "architectural_layer": layer
        })
        
    return clustered_output
