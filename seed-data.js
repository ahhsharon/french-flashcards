// Auto-seeds the deck from the initial CSV data if no data exists yet.
// This file should be loaded before app.js.

const SEED_CSV = `type,front,back,date_added
Wild,,,3/15/2026
Listening,,,3/14/2026
Speaking,,,3/13/2026
Listening,,,3/12/2026
Languish,,,3/11/2026
Lingo,,,3/10/2026
Reading,,,3/9/2026
Listening,,,3/8/2026
Reading,,,3/7/2026
Languish,,,3/6/2026
Speaking,,,3/5/2026
Lingo,,,3/4/2026
Lingo,,,3/3/2026
Speaking,,,3/2/2026
Listening,,,3/1/2026
Vocab,They're afraid all the time of getting fired. He was fired yesterday.,Its ont peur tout le temps d'être virer. Il a été viré hier.,2/28/2026
Vocab,"Advancing just to advance, there's no point. (That serves for nothing)","Avancer pour avancer, ça ne sert à rien.",2/28/2026
Listening,,,2/27/2026
Vocab,There's no more space. There's no space.,Il n'y a plus de place. Il n'y a pas de place.,2/26/2026
Vocab,"I realized that it was a holiday. Me, I didn't realize either","Je me suis rendue compte que c'était un jour férié. Moi, je ne me suis pas rendue compte non plus.",2/26/2026
Vocab,Whose is this jacket? Is it his? Is it hers? She already has hers.,C'est à qui ce manteau? C'est à lui? C'est à elle? Elle a déjà le sien.,2/26/2026
Speaking,, ,2/25/2026
Reading,,,2/24/2026
Lingo,,,2/23/2026
Reading,,,2/22/2026
Lingo,,,2/21/2026
Vocab,"Get back safe! (to a group)
Get back safe! (to a person)
Until next time!","Rentrez bien !
Rentre bien !
À la prochaine !",2/20/2026
Vocab,I have to head out. I'm heading out.,Je dois filer. Je file !,2/20/2026
Vocab,The cutting board is on the kitchen countertop.,La plache à découper es sur le plan de travail.,2/19/2026
Vocab,I am at the same time happy to have free time and incapable of enjoying it.,Je suis à la fois heureuse d'avoir du temps libre et incapable d'en profiter.,2/19/2026
Listening,,,2/18/2026
Lingo,,,2/17/2026
Reading,,,2/16/2026
Vocab,"It is important to sort the waste. Recycling, compost, other waste.","Il est important de faire le tri. Le recyclage, le compostage, autre déchets.",2/15/2026
Vocab,The teabags are on the counter.,Les sachets de thé sont sur le comptoir.,2/15/2026
Vocab,"These ones are a bit tight, but (shoes) thoses ones are ugly.","Celles-ci sont un peu serrées, mais celles-là sont moches.",2/14/2026
Vocab,I already have this game at home. I found it at Cannes.,J'ai déjà ce jeu chez moi. Je l'ai trouvé à Cannes.,2/14/2026
Vocab,We played a lot of games. I went there with my friends.,On a joué à beaucoup de jeux. J'y suis allée avec mes amis.,2/14/2026
Speaking,,,2/13/2026
Listening,,,2/12/2026
Speaking,,,2/11/2026
Listening,,,2/10/2026
Reading,,,2/9/2026
Listening,,,2/8/2026
Reading,,,2/7/2026
Vocab,"As soon as she responds, I'll tell you by message. As soon as possible!",Dès qu'elle répond je vous dis par message. Dés que possible !,2/6/2026
Vocab,I am so (too) stressed. I messed up.,Je suis trop stressée. Je me suis trompée.,2/6/2026
Speaking,,,2/5/2026
Lingo,,,2/4/2026
Reading,,,2/3/2026
Lingo,,,2/2/2026
Listening,,,2/1/2026
Vocab,"This wallet, is it yours? Oh no, you told me that yours is red.","Ce portefeuille, c'est à toi ? Ah non, tu m'as raconté que le tien est rouge.",1/31/2026
Vocab,"It's mine! Actually no, mine is bigger.","C'est à moi ! En fait, non, le mien est plus grand.",1/31/2026
Vocab,"My one (feminine), my ones (masc.), my ones (fem.)","La mienne, les miens, les miennes.",1/31/2026
Speaking,,,1/30/2026
Vocab,"You have to weigh them at the machine.
I weighed them.
I weigh them.","Vous devez les peser à la machine.
Je les ai pesés.
Je les pèse.",1/29/2026
Vocab,You can leave the other items here. (at a grocery store),Vous pouvez laissez les autres articles ici. (au superemarché),1/29/2026
Listening,,,1/28/2026
Lingo,,,1/27/2026
Vocab,There are a decent number of poodles in Paris.,Il y a pas mal de coniches à Paris. ,1/26/2026
Vocab,I was fairly embarassed.,J'étais pas mal genée.,1/26/2026
Vocab,"Can I have a box to put the leftovers? Cardboard? Yes, that works.","Est-ce que je peux avoir une boîte pour mettre les restes ? En carton ? Oui, ca marche.",1/26/2026
Reading,,,1/25/2026
Speaking,,,1/24/2026
Reading,,,1/23/2026
Speaking,,,1/22/2026
Lingo,,,1/21/2026
Vocab,I find that surprising.,Je trouve ca étonnant.,1/20/2026
Vocab,"It seems crazy to many people.
Hint: not beaucoup, not gens",Ça paraît fou pour plein de monde.,1/20/2026
Listening,,,1/19/2026
Lingo,,,1/18/2026
Reading,,,1/17/2026
Vocab,"That way, I will be nicely hair-styled for our trip in France.",Comme ça je serai bien coiffée pour notre voyage en France.,1/16/2026
Vocab,I would like to solve this problem. I solved all the problems!,J'aimerais résoudre ce problème. J'ai résolu tous les problèmes !,1/16/2026`;

(function seedIfEmpty() {
  const existing = localStorage.getItem('french-flashcards');
  if (existing) return; // Already have data, skip seeding

  // Reuse parseCSV from app.js — but since seed-data.js loads first,
  // we'll store the CSV and let app.js pick it up.
  window.__SEED_CSV = SEED_CSV;
})();
