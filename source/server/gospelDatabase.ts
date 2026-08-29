/**
 * Banco de Dados de Músicas Gospel para testes e fallback local.
 * Contém letras completas, cifras, referências bíblicas, seções e temas.
 */

import type { GospelSong } from './types.js';

export const GOSPEL_DATABASE: GospelSong[] = [
  {
    id: 'a-casa-e-sua-casa-worship',
    title: 'A Casa É Sua',
    artist: 'Casa Worship',
    album: 'A Casa É Sua',
    releaseYear: 2019,
    key: 'C',
    bpm: 68,
    theme: ['Adoração', 'Presença de Deus', 'Avivamento', 'Oração'],
    bibleReferences: ['Apocalipse 3:20', 'Salmos 133', '1 Coríntios 6:19'],
    author: 'Julliany Souza, Léo Brandão, Ricardinho',
    composer: 'Casa Worship',
    source: 'database',
    tags: ['Worship', 'Adoração', 'Espírito Santo', 'Casa de Deus'],
    fullLyrics: `Você é bem-vindo aqui
A Casa é Sua, pode entrar
Me esvazio de mim
Me esvazio de mim

Sopra Teu vento aqui
Toma o Teu trono, vem reinar
Nós queremos Te ouvir
Nós queremos Te ouvir

Essa casa é Sua casa
Deixa o Teu fogo queimar
Essa casa é Sua casa
Deixa o Teu fogo queimar

É tudo sobre Você
Tudo para Você
Jesus, Jesus`,
    chordsLyrics: `[Intro] C  G  Am  F

[Verso 1]
C
Você é bem-vindo aqui
G
A Casa é Sua, pode entrar
Am
Me esvazio de mim
F
Me esvazio de mim

[Verso 2]
C
Sopra Teu vento aqui
G
Toma o Teu trono, vem reinar
Am
Nós queremos Te ouvir
F
Nós queremos Te ouvir

[Refrão]
C
Essa casa é Sua casa
G
Deixa o Teu fogo queimar
Am
Essa casa é Sua casa
F
Deixa o Teu fogo queimar

[Ponte]
C            G
É tudo sobre Você
             Am
Tudo para Você
       F
Jesus, Jesus`,
    sections: [
      {
        type: 'verse',
        label: 'Verso 1',
        text: 'Você é bem-vindo aqui\nA Casa é Sua, pode entrar\nMe esvazio de mim\nMe esvazio de mim'
      },
      {
        type: 'verse',
        label: 'Verso 2',
        text: 'Sopra Teu vento aqui\nToma o Teu trono, vem reinar\nNós queremos Te ouvir\nNós queremos Te ouvir'
      },
      {
        type: 'chorus',
        label: 'Refrão',
        text: 'Essa casa é Sua casa\nDeixa o Teu fogo queimar\nEssa casa é Sua casa\nDeixa o Teu fogo queimar'
      },
      {
        type: 'bridge',
        label: 'Ponte',
        text: 'É tudo sobre Você\nTudo para Você\nJesus, Jesus'
      }
    ]
  },
  {
    id: 'lugar-secreto-gabriela-rocha',
    title: 'Lugar Secreto',
    artist: 'Gabriela Rocha',
    album: 'Céu',
    releaseYear: 2018,
    key: 'F#m',
    bpm: 72,
    theme: ['Intimidade', 'Oração', 'Presença', 'Adoração'],
    bibleReferences: ['Salmos 91:1', 'Mateus 6:6', 'Cânticos 2:14'],
    author: 'Gabriela Rocha',
    composer: 'Gabriela Rocha',
    source: 'database',
    tags: ['Intimidade', 'Adoração', 'Clamor', 'Gospel Nacional'],
    fullLyrics: `Tu és tudo o que eu mais quero
O meu fôlego, Tu és
Em Teus braços, é o meu lugar
Estou aqui, estou aqui

Pai, eu amo Sua presença
Teu Santo Espírito é o meu melhor amigo
E quando eu olho para Você
Eu vejo o quanto eu preciso do Teu amor

Vem me abraçar
Vem me abraçar
Tudo que eu quero é estar no Teu lugar secreto`,
    chordsLyrics: `[Intro] F#m  D  A  E

[Verso]
F#m             D
Tu és tudo o que eu mais quero
A                E
O meu fôlego, Tu és
F#m                D
Em Teus braços, é o meu lugar
A            E
Estou aqui, estou aqui

[Refrão]
F#m          D
Pai, eu amo Sua presença
A                 E
Teu Santo Espírito é o meu melhor amigo
F#m             D
E quando eu olho para Você
A                       E
Eu vejo o quanto eu preciso do Teu amor

[Ponte]
D            A
Vem me abraçar
E            F#m
Vem me abraçar
D                         A             E
Tudo que eu quero é estar no Teu lugar secreto`,
    sections: [
      {
        type: 'verse',
        label: 'Verso',
        text: 'Tu és tudo o que eu mais quero\nO meu fôlego, Tu és\nEm Teus braços, é o meu lugar\nEstou aqui, estou aqui'
      },
      {
        type: 'chorus',
        label: 'Refrão',
        text: 'Pai, eu amo Sua presença\nTeu Santo Espírito é o meu melhor amigo\nE quando eu olho para Você\nEu vejo o quanto eu preciso do Teu amor'
      },
      {
        type: 'bridge',
        label: 'Ponte',
        text: 'Vem me abraçar\nVem me abraçar\nTudo que eu quero é estar no Teu lugar secreto'
      }
    ]
  },
  {
    id: 'bondade-de-deus-isaias-saad',
    title: 'Bondade de Deus (Goodness of God)',
    artist: 'Isaías Saad',
    album: 'Bondade de Deus',
    releaseYear: 2021,
    key: 'G',
    bpm: 70,
    theme: ['Gratidão', 'Fidelidade', 'Amor de Deus', 'Paz'],
    bibleReferences: ['Salmos 23:6', 'Lamentações 3:22-23', 'Salmos 145:9'],
    author: 'Jenn Johnson, Ed Cash, Jason Ingram, Ben Fielding, Brian Johnson',
    composer: 'Bethel Music / Versão em Português',
    source: 'database',
    tags: ['Versão', 'Bethel', 'Gratidão', 'Worship'],
    fullLyrics: `Te amo, Deus, Tua graça nunca falha
Todos os dias eu estou em Tuas mãos
Desde quando me levanto até eu me deitar
Eu cantarei da bondade de Deus

És fiel em todo tempo
Em todo tempo Tu és tão, tão bom
Com todo fôlego que tenho
Eu cantarei da bondade de Deus

Tua doce voz me guia em meio ao fogo
Na escuridão, Tua presença me acalma
Eu Te conheço como Pai e como Amigo
E eu tenho vivido na bondade de Deus`,
    chordsLyrics: `[Intro] G  C  G  C

[Verso 1]
G                 C             G
Te amo, Deus, Tua graça nunca falha
D/F#    Em         C            D
Todos os dias eu estou em Tuas mãos
             Em          C
Desde quando me levanto até eu me deitar
G       D/F#     Em       C      D   G
Eu cantarei da bondade de Deus

[Refrão]
C                               G
És fiel em todo tempo
C                               G          D
Em todo tempo Tu és tão, tão bom
C                               Em    C
Com todo fôlego que tenho
G       D/F#     Em       C      D   G
Eu cantarei da bondade de Deus`,
    sections: [
      {
        type: 'verse',
        label: 'Verso 1',
        text: 'Te amo, Deus, Tua graça nunca falha\nTodos os dias eu estou em Tuas mãos\nDesde quando me levanto até eu me deitar\nEu cantarei da bondade de Deus'
      },
      {
        type: 'chorus',
        label: 'Refrão',
        text: 'És fiel em todo tempo\nEm todo tempo Tu és tão, tão bom\nCom todo fôlego que tenho\nEu cantarei da bondade de Deus'
      },
      {
        type: 'verse',
        label: 'Verso 2',
        text: 'Tua doce voz me guia em meio ao fogo\nNa escuridão, Tua presença me acalma\nEu Te conheço como Pai e como Amigo\nE eu tenho vivido na bondade de Deus'
      }
    ]
  },
  {
    id: 'porque-ele-vive-harpa-crista',
    title: 'Porque Ele Vive (Harpa Cristã nº 545)',
    artist: 'Harpa Cristã',
    album: 'Hinos Clássicos',
    releaseYear: 1971,
    key: 'Ab',
    bpm: 80,
    theme: ['Esperança', 'Ressurreição', 'Fé', 'Salvação'],
    bibleReferences: ['João 14:19', '1 Coríntios 15:55-57', 'Romanos 8:31'],
    author: 'Bill & Gloria Gaither',
    composer: 'William J. Gaither',
    source: 'database',
    tags: ['Harpa Cristã', 'Hino Tradicional', 'Páscoa', 'Ressurreição'],
    fullLyrics: `Deus enviou Seu Filho amado
Para salvar e perdoar
Na cruz morreu por meu pecado
Mas ressurgiu e vivo com o Pai está

Porque Ele vive, posso crer no amanhã
Porque Ele vive, temor não há
Mas eu bem sei, eu sei que a minha vida
Está nas mãos do meu Jesus, que vivo está

E quando enfim chegar a hora
Em que a morte enfrentarei
Sem medo, então, terei vitória
Verei na glória o meu Jesus que vivo está`,
    chordsLyrics: `[Intro] G  C  G  D  G

[Verso 1]
G              G7          C
Deus enviou Seu Filho amado
G              Em         Am   D
Para salvar e perdoar
G               G7        C
Na cruz morreu por meu pecado
G                  D              G    C  G
Mas ressurgiu e vivo com o Pai está

[Refrão]
G                G7           C
Porque Ele vive, posso crer no amanhã
G              Em         Am   D
Porque Ele vive, temor não há
G              G7           C
Mas eu bem sei, eu sei que a minha vida
G                   D              G    C  G
Está nas mãos do meu Jesus, que vivo está`,
    sections: [
      {
        type: 'verse',
        label: 'Verso 1',
        text: 'Deus enviou Seu Filho amado\nPara salvar e perdoar\nNa cruz morreu por meu pecado\nMas ressurgiu e vivo com o Pai está'
      },
      {
        type: 'chorus',
        label: 'Refrão',
        text: 'Porque Ele vive, posso crer no amanhã\nPorque Ele vive, temor não há\nMas eu bem sei, eu sei que a minha vida\nEstá nas mãos do meu Jesus, que vivo está'
      },
      {
        type: 'verse',
        label: 'Verso 2',
        text: 'E quando enfim chegar a hora\nEm que a morte enfrentarei\nSem medo, então, terei vitória\nVerei na glória o meu Jesus que vivo está'
      }
    ]
  },
  {
    id: 'ninguem-explica-deus-preto-no-branco',
    title: 'Ninguém Explica Deus',
    artist: 'Preto no Branco ft. Gabriela Rocha',
    album: 'Preto no Branco',
    releaseYear: 2015,
    key: 'E',
    bpm: 74,
    theme: ['Soberania', 'Criação', 'Fé', 'Mistério de Deus'],
    bibleReferences: ['Isaías 40:28', 'Romanos 11:33-36', 'Jó 38'],
    author: 'Clovis Pinho',
    composer: 'Clovis Pinho',
    source: 'database',
    tags: ['Acústico', 'Soul Gospel', 'Soberania', 'Duetos'],
    fullLyrics: `Nada é igual ao Seu redor
Tudo se faz no Seu olhar
O universo se formou no Seu falar
Teologia pra explicar
Ou big bang pra disfarçar
Pode alguém até duvidar
Sei que há um Deus a me guardar

E se Ele quiser, Ele ressuscita mortos
Ele faz o impossível
Tudo porque Ele é Deus
Mas se não quiser, não perde o poder
Não deixa de ser Deus
Não deixa de ser Deus

Ninguém explica Deus!`,
    chordsLyrics: `[Intro] E  B  C#m  A

[Verso]
E
Nada é igual ao Seu redor
B
Tudo se faz no Seu olhar
C#m                           A
O universo se formou no Seu falar
E
Teologia pra explicar
B
Ou big bang pra disfarçar
C#m
Pode alguém até duvidar
A
Sei que há um Deus a me guardar

[Refrão]
E
E se Ele quiser, Ele ressuscita mortos
B
Ele faz o impossível
C#m                 A
Tudo porque Ele é Deus
E
Mas se não quiser, não perde o poder
B
Não deixa de ser Deus
C#m               A
Não deixa de ser Deus

E           B    C#m   A
Ninguém explica Deus!`,
    sections: [
      {
        type: 'verse',
        label: 'Verso',
        text: 'Nada é igual ao Seu redor\nTudo se faz no Seu olhar\nO universo se formou no Seu falar\nTeologia pra explicar\nOu big bang pra disfarçar\nPode alguém até duvidar\nSei que há um Deus a me guardar'
      },
      {
        type: 'chorus',
        label: 'Refrão',
        text: 'E se Ele quiser, Ele ressuscita mortos\nEle faz o impossível\nTudo porque Ele é Deus\nMas se não quiser, não perde o poder\nNão deixa de ser Deus\nNão deixa de ser Deus'
      },
      {
        type: 'tag',
        label: 'Final',
        text: 'Ninguém explica Deus!'
      }
    ]
  },
  {
    id: 'ousado-amor-isaias-saad',
    title: 'Ousado Amor (Reckless Love)',
    artist: 'Isaías Saad',
    album: 'Ousado Amor',
    releaseYear: 2018,
    key: 'Gb',
    bpm: 66,
    theme: ['Graça', 'Redenção', 'Amor Incondicional'],
    bibleReferences: ['Lucas 15:4-7', 'Romanos 5:8', '1 João 4:19'],
    author: 'Cory Asbury, Caleb Culver, Ran Jackson',
    composer: 'Bethel Music',
    source: 'database',
    tags: ['Amor de Deus', 'Redenção', 'Worship'],
    fullLyrics: `Antes de eu falar
Tu cantavas sobre mim
Tu tens sido tão, tão bom pra mim
Antes de eu respirar
Sopraste Tua vida em mim
Tu tens sido tão, tão bom pra mim

Oh, impressionante, infinito e ousado amor de Deus
Oh, que deixa as noventa e nove só pra me encontrar
Não posso comprá-lo, nem merecê-lo
Mesmo assim Se entregou
Oh, impressionante, infinito e ousado amor de Deus

Traz luz para as sombras
Escala montanhas
Pra me encontrar
Derruba muralhas
Destrói as mentiras
Pra me encontrar`,
    sections: [
      {
        type: 'verse',
        label: 'Verso 1',
        text: 'Antes de eu falar\nTu cantavas sobre mim\nTu tens sido tão, tão bom pra mim\nAntes de eu respirar\nSopraste Tua vida em mim\nTu tens sido tão, tão bom pra mim'
      },
      {
        type: 'chorus',
        label: 'Refrão',
        text: 'Oh, impressionante, infinito e ousado amor de Deus\nOh, que deixa as noventa e nove só pra me encontrar\nNão posso comprá-lo, nem merecê-lo\nMesmo assim Se entregou\nOh, impressionante, infinito e ousado amor de Deus'
      },
      {
        type: 'bridge',
        label: 'Ponte',
        text: 'Traz luz para as sombras\nEscala montanhas\nPra me encontrar\nDerruba muralhas\nDestrói as mentiras\nPra me encontrar'
      }
    ]
  },
  {
    id: 'grandioso-es-tu-hino',
    title: 'Grandioso És Tu (How Great Thou Art)',
    artist: 'Harpa Cristã nº 526',
    album: 'Hinos Inesquecíveis',
    releaseYear: 1885,
    key: 'Bb',
    bpm: 72,
    theme: ['Grandeza de Deus', 'Criação', 'Louvor', 'Cruz'],
    bibleReferences: ['Salmos 8:1', 'Salmos 19:1', 'Filipenses 2:9-11'],
    author: 'Carl Boberg / Stuart K. Hine',
    source: 'database',
    tags: ['Clássico', 'Harpa Cristã', 'Adoração Eterna'],
    fullLyrics: `Senhor meu Deus, quando eu maravilhado
Fico a pensar nas obras de Tuas mãos
No céu azul de estrelas pontilhado
O Seu poder mostrando a criação

Então minh'alma canta a Ti, Senhor
Grandioso és Tu, grandioso és Tu!
Então minh'alma canta a Ti, Senhor
Grandioso és Tu, grandioso és Tu!

Quando eu medito em Teu amor tão grande
Seu Filho dando ao mundo pra salvar
Na cruz vertendo o Seu precioso sangue
Minh'alma pôde a salvação ganhar`,
    sections: [
      {
        type: 'verse',
        label: 'Verso 1',
        text: 'Senhor meu Deus, quando eu maravilhado\nFico a pensar nas obras de Tuas mãos\nNo céu azul de estrelas pontilhado\nO Seu poder mostrando a criação'
      },
      {
        type: 'chorus',
        label: 'Refrão',
        text: 'Então minh\'alma canta a Ti, Senhor\nGrandioso és Tu, grandioso és Tu!\nEntão minh\'alma canta a Ti, Senhor\nGrandioso és Tu, grandioso és Tu!'
      },
      {
        type: 'verse',
        label: 'Verso 2',
        text: 'Quando eu medito em Teu amor tão grande\nSeu Filho dando ao mundo pra salvar\nNa cruz vertendo o Seu precioso sangue\nMinh\'alma pôde a salvação ganhar'
      }
    ]
  },
  {
    id: 'rua-de-ouro-morada',
    title: 'É Tudo Sobre Você',
    artist: 'Morada',
    album: 'Uma Coisa',
    releaseYear: 2017,
    key: 'D',
    bpm: 68,
    theme: ['Centralidade de Cristo', 'Eternidade', 'Adoração'],
    bibleReferences: ['Colossenses 1:16', 'Hebreus 12:2', 'Apocalipse 4:11'],
    author: 'Brunão Morada',
    source: 'database',
    tags: ['Worship', 'Morada', 'Cristocêntrico'],
    fullLyrics: `Você é a minha luz
Minha salvação
De quem terei medo?
O Senhor é a fortaleza da minha vida
A quem temerei?

Uma coisa peço ao Senhor
E a buscarei
Que eu possa morar na Tua casa
Todos os dias da minha vida

É tudo sobre Você
Tudo para Você
Jesus, Jesus`,
    sections: [
      {
        type: 'verse',
        label: 'Verso 1',
        text: 'Você é a minha luz\nMinha salvação\nDe quem terei medo?\nO Senhor é a fortaleza da minha vida\nA quem temerei?'
      },
      {
        type: 'chorus',
        label: 'Refrão',
        text: 'Uma coisa peço ao Senhor\nE a buscarei\nQue eu possa morar na Tua casa\nTodos os dias da minha vida'
      }
    ]
  }
];
