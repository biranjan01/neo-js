import pickle
import os

pickle_filename = "population_genotype_map.p"
pickle_file_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), pickle_filename)

with open(pickle_file_path, "rb") as pickle_file:
    population_coverage = pickle.load(pickle_file)
    country_ethnicity = pickle.load(pickle_file)
    ethnicity = pickle.load(pickle_file)
