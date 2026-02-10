
// ==========================================
// CONFIGURACIÓN BACKEND (GOOGLE APPS SCRIPT)
// ==========================================
const SPREADSHEET_ID = '1Uxet-04_DygSHF7mZmVYtztUI7Hgz5GF3xqu8lds85U'; 
const TIMEZONE = "America/Lima";

function doGet(e) {
  return ContentService.createTextOutput("API Active");
}

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const action = data.action;
    let result = {};

    if (action === 'login') result = apiLogin(data.email, data.password);
    else if (action === 'book') result = apiBook(data);
    else if (action === 'getBookings') result = apiGetBookings(data.email);
    else if (action === 'cancel') result = apiCancel(data.id);
    else if (action === 'getCommunityPosts') result = apiGetPosts(data.tower);
    else if (action === 'createPost') result = apiCreatePost(data.email, data.text, data.image);
    else if (action === 'updateProfile') result = apiUpdateProfile(data.email, data.newName, data.newTower);
    else if (action === 'createTower') result = apiCreateTower(data);
    else if (action === 'getCommunities') result = apiGetCommunities();
    else if (action === 'requestJoin') result = apiRequestJoin(data);
    
    else result = { success: false, error: 'Acción desconocida' };

    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ success: false, error: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// --- LOGIC ---

function apiLogin(email, password) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Usuarios');
  const data = sheet.getDataRange().getValues();
  
  for (let i = 1; i < data.length; i++) {
    // Col 2: Email, Col 3: Pass, Col 7: Status
    if (String(data[i][2]).toLowerCase() === String(email).toLowerCase() && String(data[i][3]) === String(password)) {
       if (data[i][7] === 'INACTIVO') return { success: false, error: 'Usuario desactivado.' };
       
       return { 
         success: true, 
         user: {
           email: data[i][2],
           name: data[i][1],
           role: data[i][4],
           tower: data[i][5] || 'Torre A', 
           apartment: data[i][6] || "101", 
           points: data[i][8] || 0,
           level: calculateLevel(data[i][8] || 0)
         }
       };
    }
  }
  return { success: false, error: 'Credenciales inválidas' };
}

function apiGetCommunities() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('Comunidades');
  
  // Create sheet if not exists for demo purpose
  if (!sheet) {
    sheet = ss.insertSheet('Comunidades');
    sheet.appendRow(['ID', 'Name', 'Address', 'AdminEmail', 'TotalFloors', 'UnitsPerFloor']);
    sheet.appendRow(['C1', 'Torre Las Flores', 'Av. Principal 123', 'admin@roomly.app', 20, 4]);
    sheet.appendRow(['C2', 'Residencial Los Andes', 'Calle Sur 55', 'admin@roomly.app', 10, 6]);
  }

  const data = sheet.getDataRange().getValues();
  const communities = [];
  
  for (let i = 1; i < data.length; i++) {
    communities.push({
      id: data[i][0],
      name: data[i][1],
      address: data[i][2],
      adminEmail: data[i][3],
      totalFloors: data[i][4] || 20,
      unitsPerFloor: data[i][5] || 4
    });
  }
  return { success: true, communities: communities };
}

function apiRequestJoin(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('Solicitudes');
  let commSheet = ss.getSheetByName('Comunidades');
  
  if (!sheet) {
    sheet = ss.insertSheet('Solicitudes');
    sheet.appendRow(['ID', 'TicketCode', 'CommunityID', 'CommunityName', 'UserEmail', 'UserName', 'Unit', 'Status', 'Date']);
  }

  // Find Admin Email
  const commData = commSheet.getDataRange().getValues();
  let adminEmail = "";
  for(let i=1; i<commData.length; i++){
    if(commData[i][0] === data.communityId) {
       adminEmail = commData[i][3];
       break;
    }
  }

  if(!adminEmail) return { success: false, error: "Comunidad no válida o sin admin." };

  // Generate Ticket ID (Correlative per community)
  const reqData = sheet.getDataRange().getValues();
  let count = 0;
  for(let i=1; i<reqData.length; i++) {
    if(reqData[i][2] === data.communityId) count++;
  }
  const sequence = String(count + 1).padStart(4, '0');
  const ticketId = `${data.communityId}-S${sequence}`; // e.g. C1-S0001

  // Save Request
  sheet.appendRow([
    Utilities.getUuid(),
    ticketId,
    data.communityId,
    data.communityName,
    data.userEmail,
    data.userName,
    data.unit,
    'PENDIENTE',
    new Date()
  ]);

  // Send Email
  const subject = `Nueva Solicitud de Ingreso: ${ticketId}`;
  const htmlBody = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd; border-radius: 8px; overflow: hidden;">
      <div style="background-color: #7c3aed; padding: 20px; text-align: center;">
         <img src="https://i.ibb.co/0VvpgLJn/el-pedregal-s-a-logo-1.png" style="width: 50px; height: 50px; border-radius: 8px;">
         <h2 style="color: white; margin: 10px 0;">Roomly</h2>
      </div>
      <div style="padding: 20px;">
        <h3 style="color: #333;">Solicitud por aprobar</h3>
        <p>Hola Administrador,</p>
        <p>Tienes una nueva solicitud de ingreso para la comunidad <strong>${data.communityName}</strong>.</p>
        
        <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Ticket:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee; color: #7c3aed;">${ticketId}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Usuario:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${data.userName}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Email:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${data.userEmail}</td>
          </tr>
          <tr>
            <td style="padding: 8px; border-bottom: 1px solid #eee; font-weight: bold;">Unidad Solicitada:</td>
            <td style="padding: 8px; border-bottom: 1px solid #eee;">${data.unit}</td>
          </tr>
        </table>
        
        <div style="margin-top: 25px; text-align: center;">
          <a href="#" style="background-color: #7c3aed; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px;">Gestionar en App</a>
        </div>
      </div>
      <div style="background-color: #f9f9f9; padding: 10px; text-align: center; font-size: 12px; color: #888;">
        © 2024 Roomly. Todos los derechos reservados.
      </div>
    </div>
  `;

  try {
    MailApp.sendEmail({
      to: adminEmail,
      subject: subject,
      htmlBody: htmlBody
    });
  } catch(e) {
    console.log("Error sending email: " + e.toString());
    // Proceed anyway
  }

  return { success: true, ticketId: ticketId };
}

function apiCreateTower(data) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('Comunidades');
  
  if (!sheet) {
    sheet = ss.insertSheet('Comunidades');
    sheet.appendRow(['ID', 'Name', 'Address', 'AdminEmail', 'TotalFloors', 'UnitsPerFloor']);
  }

  // Generate Community ID
  const commData = sheet.getDataRange().getValues();
  const nextId = "C" + (commData.length); // Simple C1, C2...

  sheet.appendRow([
    nextId,
    data.name,
    data.address,
    data.adminEmail,
    20, // Default floors
    4   // Default units
  ]);

  // Optionally create user account for admin
  // ...

  return { success: true };
}

// ... Existing Helper Functions ...
function apiGetPosts(tower) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName('Comunidad');
  if (!sheet) {
    sheet = ss.insertSheet('Comunidad');
    sheet.appendRow(['ID', 'UserEmail', 'UserName', 'Tower', 'Text', 'Image', 'Date', 'Likes', 'Comments']);
    // Dummy Data
    sheet.appendRow([Utilities.getUuid(), 'admin@test.com', 'Admin', tower || 'Torre A', '¡Bienvenidos a la nueva app!', '', new Date(), 5, 2]);
  }
  
  const data = sheet.getDataRange().getValues();
  const posts = [];
  
  for (let i = data.length - 1; i >= 1; i--) {
    const row = data[i];
    posts.push({
      id: row[0],
      userEmail: row[1],
      userName: row[2],
      userTower: row[3],
      text: row[4],
      image: row[5],
      timestamp: Utilities.formatDate(new Date(row[6]), TIMEZONE, "dd MMM HH:mm"),
      likes: row[7],
      comments: row[8]
    });
  }
  
  return { success: true, posts: posts };
}

function apiCreatePost(email, text, image) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Comunidad');
  const userSheet = ss.getSheetByName('Usuarios');
  
  let userName = "Usuario";
  let tower = "Torre A";
  const userData = userSheet.getDataRange().getValues();
  let userRowIndex = -1;
  
  for(let i=1; i<userData.length; i++) {
    if(userData[i][2] === email) {
      userName = userData[i][1];
      tower = userData[i][5];
      userRowIndex = i + 1;
      break;
    }
  }
  
  sheet.appendRow([
    Utilities.getUuid(),
    email,
    userName,
    tower,
    text,
    image || '',
    new Date(),
    0,
    0
  ]);
  
  if(userRowIndex !== -1) {
    const currentPoints = parseInt(userSheet.getRange(userRowIndex, 9).getValue() || 0); 
    userSheet.getRange(userRowIndex, 9).setValue(currentPoints + 5);
  }
  
  return { success: true };
}

function apiBook(payload) {
  const lock = LockService.getScriptLock();
  try { lock.waitLock(10000); } catch (e) { return { success: false, error: 'Servidor ocupado' }; }

  try {
    const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
    const sheet = ss.getSheetByName('Reservas');
    
    const slots = payload.slots || [];
    slots.forEach(s => {
       sheet.appendRow([Utilities.getUuid(), payload.user, payload.room, "'" + payload.date, "'" + s, 'ACTIVA', 'PENDIENTE']);
    });
    
    addPoints(payload.user, 10);
    
    return { success: true };
  } catch(e) {
    return { success: false, error: e.toString() };
  } finally {
    lock.releaseLock();
  }
}

function addPoints(email, points) {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName('Usuarios');
  const data = sheet.getDataRange().getValues();
  for(let i=1; i<data.length; i++){
    if(data[i][2] === email) {
      const current = parseInt(data[i][8] || 0);
      sheet.getRange(i+1, 9).setValue(current + points);
      break;
    }
  }
}

function calculateLevel(points) {
  if (points > 1000) return "Leyenda";
  if (points > 500) return "Líder";
  if (points > 100) return "Vecino Activo";
  return "Nuevo";
}

function apiGetBookings(e){return {success:true, bookings:[]}}
function apiCancel(id){return {success:true}} 
function apiUpdateProfile(e,n,t){return {success:true};}
