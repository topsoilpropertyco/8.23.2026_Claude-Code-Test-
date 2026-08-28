"""Template for config/identity.py. Copy it, fill it in, and never commit the copy.

config/identity.py is git-ignored on purpose: it is the only place in this tool
where mailbox-derived personal data lives. The engine in bin/sweep.py is generic
and safe to commit; this file is not.
"""

SETH = {"you@example.com"}                      # every address you send from
ASSISTANTS = {"assistant@example.com"}          # people acting on your behalf

# A value containing "relational" triggers veto:relational, which outranks
# every routing rule, including the storage pile.
PEOPLE = {"partnersurname": "Business Partner [relational]"}

FAMILY_NAMES = r"""  spouseaddress | \bchildname\b  """
STORAGE_NAMES = r"""  dealbroker | titlecompany  """
