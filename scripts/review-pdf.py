import sys
sys.path.insert(0,'.tools')
import pymupdf as fitz
from pathlib import Path
for filename in ['proposta-200','proposta-dois-itens','proposta-ecoclean','proposta-ecoclean-extensa','ecoclean-offline','ecoclean-http']:
    doc=fitz.open(f'validacao/{filename}.pdf')
    print(filename, 'pages:',len(doc),'fonts:', sorted(set(f[3] for p in doc for f in p.get_fonts())))
    assert len(doc) > 1 if filename=='proposta-ecoclean-extensa' else len(doc)==1, filename
    content=''.join(p.get_text() for p in doc)
    assert 'Investimento total' in content and 'VALOR NO PIX' in content and 'Sem juros' in content, filename
    assert 'file:///' not in content and 'index.html' not in content and 'C:/Users/' not in content, filename
    for page in doc:
        for x0,y0,x1,y1,word,*_ in page.get_text('words'):
            assert x0>=0 and y0>=0 and x1<=page.rect.width+1 and y1<=page.rect.height+1,(filename,word)
    if filename!='proposta-ecoclean-extensa':
        for i in range(min(2,len(doc))):doc[i].get_pixmap(matrix=fitz.Matrix(1.2,1.2)).save(f'validacao/{filename}-{i+1}.png')
