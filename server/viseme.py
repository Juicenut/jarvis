"""Viseme mapping — word timestamps to Oculus viseme data.

For v1 with Google Cloud TTS + TalkingHead.js, viseme mapping is handled
client-side by TalkingHead's native integration. This module provides a
server-side fallback and the reference mapping table.

The 15 Oculus (OVR) visemes:
  sil, PP, FF, TH, DD, kk, CH, SS, nn, RR, aa, E, ih, oh, ou
"""

import logging

logger = logging.getLogger("jarvis.viseme")

# Phoneme to Oculus viseme mapping (ARPAbet -> OVR viseme ID)
# Based on Oculus LipSync documentation
PHONEME_TO_VISEME = {
    # Silence
    "SIL": "sil",
    # Bilabial plosives/nasals (P, B, M)
    "P": "PP", "B": "PP", "M": "PP",
    # Labiodental fricatives (F, V)
    "F": "FF", "V": "FF",
    # Dental fricatives (TH, DH)
    "TH": "TH", "DH": "TH",
    # Alveolar plosives (T, D)
    "T": "DD", "D": "DD",
    # Velar plosives (K, G)
    "K": "kk", "G": "kk",
    # Affricates (CH, JH)
    "CH": "CH", "JH": "CH",
    # Sibilants (S, Z, SH, ZH)
    "S": "SS", "Z": "SS", "SH": "SS", "ZH": "SS",
    # Alveolar nasal (N), lateral (L)
    "N": "nn", "L": "nn", "NG": "nn",
    # Rhotics (R)
    "R": "RR", "ER": "RR",
    # Open vowels (AA, AE, AH)
    "AA": "aa", "AE": "aa", "AH": "aa",
    # Mid vowels (EH, EY)
    "EH": "E", "EY": "E",
    # Close vowels (IH, IY)
    "IH": "ih", "IY": "ih",
    # Rounded vowels (AO, OW)
    "AO": "oh", "OW": "oh",
    # Close rounded vowels (UH, UW, OY)
    "UH": "ou", "UW": "ou", "OY": "ou",
    # Semivowels
    "W": "ou", "Y": "ih", "HH": "sil",
    # Diphthongs
    "AW": "aa", "AY": "aa",
}


def word_to_viseme(word: str) -> str:
    """Simple heuristic: map first character to a viseme.

    For production use, integrate CMUdict for proper phoneme lookup.
    This is a rough fallback — TalkingHead handles visemes natively
    when using Google Cloud TTS.
    """
    if not word:
        return "sil"
    first = word[0].upper()
    char_to_viseme = {
        "A": "aa", "B": "PP", "C": "kk", "D": "DD", "E": "E",
        "F": "FF", "G": "kk", "H": "sil", "I": "ih", "J": "CH",
        "K": "kk", "L": "nn", "M": "PP", "N": "nn", "O": "oh",
        "P": "PP", "Q": "kk", "R": "RR", "S": "SS", "T": "DD",
        "U": "ou", "V": "FF", "W": "ou", "X": "SS", "Y": "ih",
        "Z": "SS",
    }
    return char_to_viseme.get(first, "sil")
