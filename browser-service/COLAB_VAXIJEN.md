# NeoPeptide VaxiJen Runner (Google Colab)

## Setup

1. Open https://colab.research.google.com
2. Create new notebook
3. Copy the cells below

## Cell 1: Install dependencies
```python
!pip install curl_cffi pandas
```

## Cell 2: Upload your neoantigens CSV
```python
from google.colab import files
import pandas as pd

print("Upload your neoantigens_mhc_I.csv file:")
uploaded = files.upload()

filename = list(uploaded.keys())[0]
df = pd.read_csv(filename)
peptides = df['peptide'].unique().tolist()
print(f"Found {len(peptides)} unique peptides")
```

## Cell 3: Run VaxiJen
```python
from curl_cffi import requests
import time
import re

VAXIJEN_URL = "https://www.ddg-pharmfac.net/vaxijen/VaxiJen/VaxiJen.cgi"
TARGET = "Tumour"
THRESHOLD = "0.5"

def create_fasta(peptides):
    return "\n".join([f">pep{i+1}\n{p}" for i, p in enumerate(peptides)])

def run_vaxijen_batch(peptides):
    fasta = create_fasta(peptides)
    data = {
        "sequence": fasta,
        "Target": TARGET,
        "threshold": THRESHOLD,
        "SequenceOnOff": "on",
        "SummaryMode": "off",
        "Verbose": "off",
    }
    
    resp = requests.post(VAXIJEN_URL, data=data, impersonate="chrome", timeout=120)
    
    if resp.status_code != 200:
        print(f"Error: {resp.status_code}")
        return {}
    
    # Parse results
    regex = r"Overall Prediction for the Protective Antigen\s*=\s*(-?[\d.]+)\s*\(([^)]+)\)"
    matches = re.findall(regex, resp.text)
    
    results = {}
    for i, (score, pred) in enumerate(matches):
        if i < len(peptides):
            pred_clean = "Antigen" if "NON" not in pred.upper() else "Non-antigen"
            results[peptides[i]] = {"score": float(score), "prediction": pred_clean}
    
    return results

# Process in batches of 50
all_results = {}
batch_size = 50

for i in range(0, len(peptides), batch_size):
    batch = peptides[i:i+batch_size]
    print(f"Batch {i//batch_size + 1}/{(len(peptides)-1)//batch_size + 1}: {len(batch)} peptides...")
    
    results = run_vaxijen_batch(batch)
    all_results.update(results)
    
    if i + batch_size < len(peptides):
        time.sleep(2)  # Rate limit

print(f"\nCompleted! {len(all_results)}/{len(peptides)} peptides processed")
```

## Cell 4: Add results to CSV and download
```python
# Add VaxiJen results to dataframe
df['vaxijen_score'] = df['peptide'].map(lambda p: all_results.get(p, {}).get('score', 'N/A'))
df['vaxijen_prediction'] = df['peptide'].map(lambda p: all_results.get(p, {}).get('prediction', 'N/A'))

# Save
output_file = filename.replace('.csv', '_vaxijen.csv')
df.to_csv(output_file, index=False)

# Stats
antigens = sum(1 for r in all_results.values() if r.get('prediction') == 'Antigen')
non_antigens = sum(1 for r in all_results.values() if r.get('prediction') == 'Non-antigen')
print(f"Antigens: {antigens}")
print(f"Non-antigens: {non_antigens}")

# Download
files.download(output_file)
```

## Cell 5: Upload results back to NeoPeptide (optional)
```python
# After downloading the _vaxijen.csv, you can upload it to NeoPeptide
# by adding a "Upload VaxiJen Results" button in the web app
print("Download the CSV and upload it to NeoPeptide!")
```
